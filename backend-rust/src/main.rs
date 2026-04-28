use axum::{
    extract::{ConnectInfo, State},
    http::{HeaderMap, HeaderValue, Method, StatusCode},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use chrono::Utc;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::{env, net::SocketAddr, sync::Arc};
use thiserror::Error;
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing::{error, info};
use uuid::Uuid;

#[derive(Clone)]
struct AppState {
    http_client: Client,
    google_api_key: Option<String>,
    model: String,
    firebase_web_api_key: String,
    firebase_project_id: String,
}

#[derive(Serialize)]
struct IpResponse {
    ip: String,
}

#[derive(Deserialize)]
struct SentimentSummaryRequest {
    signatures: Vec<String>,
}

#[derive(Serialize)]
struct SentimentSummaryResponse {
    #[serde(rename = "sentimentSummary")]
    sentiment_summary: String,
}

#[derive(Deserialize)]
struct SignatureCreateRequest {
    #[serde(rename = "studentId")]
    student_id: String,
    #[serde(rename = "signatureImageUrl")]
    signature_image_url: String,
    #[serde(rename = "signatoryName")]
    signatory_name: String,
    #[serde(rename = "signatoryNote")]
    signatory_note: String,
    position: SignaturePosition,
}

#[derive(Deserialize)]
struct SignaturePosition {
    x: f64,
    y: f64,
}

#[derive(Serialize)]
struct SignatureCreateResponse {
    #[serde(rename = "signatureId")]
    signature_id: String,
}

#[derive(Serialize)]
struct ErrorBody {
    error: String,
}

#[derive(Error, Debug)]
enum ApiError {
    #[error("bad request: {0}")]
    BadRequest(String),
    #[error("unauthorized: {0}")]
    Unauthorized(String),
    #[error("conflict: {0}")]
    Conflict(String),
    #[error("upstream error: {0}")]
    Upstream(String),
    #[error("internal error")]
    Internal,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiError::BadRequest(message) => (StatusCode::BAD_REQUEST, message),
            ApiError::Unauthorized(message) => (StatusCode::UNAUTHORIZED, message),
            ApiError::Conflict(message) => (StatusCode::CONFLICT, message),
            ApiError::Upstream(message) => (StatusCode::BAD_GATEWAY, message),
            ApiError::Internal => (StatusCode::INTERNAL_SERVER_ERROR, "internal error".to_string()),
        };
        (status, Json(ErrorBody { error: message })).into_response()
    }
}

#[derive(Serialize)]
struct GeminiRequest {
    contents: Vec<GeminiContent>,
}

#[derive(Serialize)]
struct GeminiContent {
    parts: Vec<GeminiPart>,
}

#[derive(Serialize)]
struct GeminiPart {
    text: String,
}

#[derive(Deserialize)]
struct GeminiResponse {
    candidates: Option<Vec<GeminiCandidate>>,
}

#[derive(Deserialize)]
struct GeminiCandidate {
    content: Option<GeminiContentResponse>,
}

#[derive(Deserialize)]
struct GeminiContentResponse {
    parts: Option<Vec<GeminiPartResponse>>,
}

#[derive(Deserialize)]
struct GeminiPartResponse {
    text: Option<String>,
}

#[derive(Serialize)]
struct IdentityToolkitLookupRequest {
    #[serde(rename = "idToken")]
    id_token: String,
}

#[derive(Deserialize)]
struct IdentityToolkitLookupResponse {
    users: Option<Vec<IdentityToolkitUser>>,
}

#[derive(Deserialize)]
struct IdentityToolkitUser {
    #[serde(rename = "localId")]
    local_id: String,
}

#[derive(Serialize)]
struct FirestoreWriteDocument {
    fields: serde_json::Value,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    dotenvy::dotenv().ok();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "signpen_backend=info,tower_http=info".into()),
        )
        .init();

    let google_api_key = env::var("GOOGLE_API_KEY").ok();
    let model = env::var("GEMINI_MODEL").unwrap_or_else(|_| "gemini-2.5-flash".to_string());
    let firebase_web_api_key = env::var("FIREBASE_WEB_API_KEY")
        .map_err(|_| anyhow::anyhow!("FIREBASE_WEB_API_KEY is required for token verification"))?;
    let firebase_project_id = env::var("FIREBASE_PROJECT_ID")
        .map_err(|_| anyhow::anyhow!("FIREBASE_PROJECT_ID is required for Firestore writes"))?;
    let port = env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(8080);

    let app_state = Arc::new(AppState {
        http_client: Client::new(),
        google_api_key,
        model,
        firebase_web_api_key,
        firebase_project_id,
    });

    if app_state.google_api_key.is_none() {
        info!(
            "GOOGLE_API_KEY is not set; /api/sentiment-summary will return an error until configured"
        );
    }

    let cors = CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([axum::http::header::CONTENT_TYPE]);

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/ip", get(get_ip))
        .route("/api/sentiment-summary", post(post_sentiment_summary))
        .route("/api/signatures", post(post_signatures))
        .layer(TraceLayer::new_for_http())
        .layer(cors)
        .with_state(app_state);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    info!("signpen backend listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<SocketAddr>(),
    )
    .await?;

    Ok(())
}

async fn health() -> impl IntoResponse {
    (StatusCode::OK, "ok")
}

async fn get_ip(
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
) -> Json<IpResponse> {
    let ip = extract_ip(&headers, remote_addr);
    Json(IpResponse { ip })
}

async fn post_sentiment_summary(
    State(state): State<Arc<AppState>>,
    Json(body): Json<SentimentSummaryRequest>,
) -> Result<Json<SentimentSummaryResponse>, ApiError> {
    if body.signatures.is_empty() {
        return Err(ApiError::BadRequest(
            "signatures must contain at least one item".to_string(),
        ));
    }

    let prompt = build_prompt(&body.signatures);
    let summary = generate_summary(&state, &prompt).await?;

    Ok(Json(SentimentSummaryResponse { sentiment_summary: summary }))
}

async fn post_signatures(
    ConnectInfo(remote_addr): ConnectInfo<SocketAddr>,
    State(state): State<Arc<AppState>>,
    headers: HeaderMap,
    Json(body): Json<SignatureCreateRequest>,
) -> Result<Json<SignatureCreateResponse>, ApiError> {
    if body.student_id.trim().is_empty() {
        return Err(ApiError::BadRequest("studentId is required".to_string()));
    }
    if body.signature_image_url.trim().is_empty() {
        return Err(ApiError::BadRequest(
            "signatureImageUrl is required".to_string(),
        ));
    }
    if body.signatory_name.trim().is_empty() {
        return Err(ApiError::BadRequest("signatoryName is required".to_string()));
    }
    if body.signatory_note.trim().is_empty() {
        return Err(ApiError::BadRequest("signatoryNote is required".to_string()));
    }

    let bearer_token = extract_bearer_token(&headers)?;
    verify_firebase_token(&state, &bearer_token).await?;

    let ip = extract_ip(&headers, remote_addr);
    let signed_ip_path = format!("students/{}/signedIps/{}", body.student_id, ip);

    if firestore_document_exists(&state, &signed_ip_path, &bearer_token).await? {
        return Err(ApiError::Conflict(
            "You have already signed this board from this IP.".to_string(),
        ));
    }

    let signature_id = Uuid::new_v4().to_string();
    let signature_path = format!("students/{}/signatures/{}", body.student_id, signature_id);

    let now = Utc::now().to_rfc3339();
    let signature_fields = serde_json::json!({
        "studentId": { "stringValue": body.student_id },
        "signatureImageUrl": { "stringValue": body.signature_image_url },
        "signatoryName": { "stringValue": body.signatory_name },
        "signatoryNote": { "stringValue": body.signatory_note },
        "position": {
            "mapValue": {
                "fields": {
                    "x": { "doubleValue": body.position.x },
                    "y": { "doubleValue": body.position.y }
                }
            }
        },
        "timestamp": { "timestampValue": now }
    });

    let signed_ip_fields = serde_json::json!({
        "signedAt": { "timestampValue": Utc::now().to_rfc3339() }
    });

    write_firestore_document(&state, &signature_path, signature_fields, &bearer_token).await?;
    write_firestore_document(&state, &signed_ip_path, signed_ip_fields, &bearer_token).await?;

    Ok(Json(SignatureCreateResponse { signature_id }))
}

fn build_prompt(signatures: &[String]) -> String {
    let mut prompt = String::from(
        "Summarize the overall sentiment expressed in the following signatures. Focus on identifying and articulating overarching emotional trends and key sentiments.\nSignatures:\n",
    );

    for signature in signatures {
        prompt.push_str("- ");
        prompt.push_str(signature);
        prompt.push('\n');
    }

    prompt
}

async fn generate_summary(state: &AppState, prompt: &str) -> Result<String, ApiError> {
    let google_api_key = state.google_api_key.as_ref().ok_or_else(|| {
        ApiError::BadRequest("GOOGLE_API_KEY is not configured on the Rust backend".to_string())
    })?;

    let request = GeminiRequest {
        contents: vec![GeminiContent {
            parts: vec![GeminiPart {
                text: prompt.to_string(),
            }],
        }],
    };

    let endpoint = format!(
        "https://generativelanguage.googleapis.com/v1beta/models/{}:generateContent?key={}",
        state.model, google_api_key
    );

    let response = state
        .http_client
        .post(endpoint)
        .json(&request)
        .send()
        .await
        .map_err(|err| {
            error!("gemini request failed: {err}");
            ApiError::Upstream("failed to call sentiment provider".to_string())
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        error!("gemini non-success status {status}: {body}");
        return Err(ApiError::Upstream(
            "sentiment provider returned an error".to_string(),
        ));
    }

    let body: GeminiResponse = response.json().await.map_err(|err| {
        error!("gemini response parse failed: {err}");
        ApiError::Internal
    })?;

    let summary = body
        .candidates
        .and_then(|mut candidates| candidates.drain(..).next())
        .and_then(|candidate| candidate.content)
        .and_then(|content| content.parts)
        .and_then(|mut parts| parts.drain(..).next())
        .and_then(|part| part.text)
        .map(|text| text.trim().to_string())
        .filter(|text| !text.is_empty())
        .ok_or_else(|| ApiError::Upstream("sentiment provider returned no summary".to_string()))?;

    Ok(summary)
}

fn extract_bearer_token(headers: &HeaderMap) -> Result<String, ApiError> {
    let auth_header = headers
        .get("authorization")
        .and_then(|value| value.to_str().ok())
        .unwrap_or("");

    let token = auth_header
        .strip_prefix("Bearer ")
        .or_else(|| auth_header.strip_prefix("bearer "))
        .map(str::trim)
        .filter(|token| !token.is_empty())
        .ok_or_else(|| ApiError::Unauthorized("Missing bearer token.".to_string()))?;

    Ok(token.to_string())
}

async fn verify_firebase_token(state: &AppState, token: &str) -> Result<String, ApiError> {
    let endpoint = format!(
        "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={}",
        state.firebase_web_api_key
    );

    let response = state
        .http_client
        .post(endpoint)
        .json(&IdentityToolkitLookupRequest {
            id_token: token.to_string(),
        })
        .send()
        .await
        .map_err(|err| {
            error!("identity toolkit request failed: {err}");
            ApiError::Upstream("Failed to verify firebase token.".to_string())
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        error!("identity toolkit non-success status {status}: {body}");
        return Err(ApiError::Unauthorized("Invalid firebase token.".to_string()));
    }

    let payload: IdentityToolkitLookupResponse = response.json().await.map_err(|err| {
        error!("identity toolkit parse error: {err}");
        ApiError::Internal
    })?;

    let uid = payload
        .users
        .and_then(|mut users| users.drain(..).next())
        .map(|user| user.local_id)
        .filter(|uid| !uid.is_empty())
        .ok_or_else(|| ApiError::Unauthorized("Invalid firebase token.".to_string()))?;

    Ok(uid)
}

async fn firestore_document_exists(
    state: &AppState,
    document_path: &str,
    token: &str,
) -> Result<bool, ApiError> {
    let endpoint = format!(
        "https://firestore.googleapis.com/v1/projects/{}/databases/(default)/documents/{}",
        state.firebase_project_id, document_path
    );

    let response = state
        .http_client
        .get(endpoint)
        .bearer_auth(token)
        .send()
        .await
        .map_err(|err| {
            error!("firestore exists request failed: {err}");
            ApiError::Upstream("Failed to query Firestore.".to_string())
        })?;

    if response.status() == StatusCode::NOT_FOUND {
        return Ok(false);
    }

    if response.status().is_success() {
        return Ok(true);
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    error!("firestore exists non-success status {status}: {body}");
    Err(ApiError::Upstream("Failed to query Firestore.".to_string()))
}

async fn write_firestore_document(
    state: &AppState,
    document_path: &str,
    fields: serde_json::Value,
    token: &str,
) -> Result<(), ApiError> {
    let endpoint = format!(
        "https://firestore.googleapis.com/v1/projects/{}/databases/(default)/documents/{}",
        state.firebase_project_id, document_path
    );

    let response = state
        .http_client
        .patch(endpoint)
        .bearer_auth(token)
        .json(&FirestoreWriteDocument { fields })
        .send()
        .await
        .map_err(|err| {
            error!("firestore write request failed: {err}");
            ApiError::Upstream("Failed to write to Firestore.".to_string())
        })?;

    if response.status().is_success() {
        return Ok(());
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    error!("firestore write non-success status {status}: {body}");
    Err(ApiError::Upstream("Failed to write to Firestore.".to_string()))
}

fn extract_ip(headers: &HeaderMap, remote_addr: SocketAddr) -> String {
    if let Some(ip) = header_value(headers.get("x-forwarded-for")) {
        return ip;
    }

    if let Some(ip) = header_value(headers.get("x-real-ip")) {
        return ip;
    }

    remote_addr.ip().to_string()
}

fn header_value(value: Option<&HeaderValue>) -> Option<String> {
    value
        .and_then(|header| header.to_str().ok())
    .and_then(|raw| raw.split(',').next())
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
        .map(ToOwned::to_owned)
}
