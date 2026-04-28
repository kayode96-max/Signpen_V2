# SignPen - Optimized Edition

The optimized version merging **studio_signout** (full Firebase app) with **Signpen-3D-modelling** (3-D t-shirt).

## What's new vs studio_signout

| Feature | studio_signout | signpen (this) |
|---|---|---|
| Classic 2-D signing board | Yes | Yes |
| 3-D rotatable t-shirt signing | No | Yes - NEW |
| Avatar edit from Customize page | No | Yes - NEW |
| Background image (own card) | Buried in Danger Zone | Fixed |
| AI sentiment summary | Yes | Yes |
| PDF / PNG export | Yes | Yes |
| Firebase Auth + Firestore + Storage | Yes | Yes |

## New files

- src/components/3d/TShirtCanvas.tsx - React Three.js scene wrapper
- src/components/3d/TShirtSigningModal.tsx - Full 3-D signing UI
- public/model/tshirt.gltf - GLTF model (from Signpen-3D-modelling)
- public/model/textures/ - Shirt textures

## Modified files

- src/components/signature/public-sign-out-page.tsx - Added Classic Board / 3-D T-Shirt tabs
- src/app/dashboard/customize/page.tsx - Avatar upload card at the top
- src/app/dashboard/settings/page.tsx - Background image in own card, better avatar preview
- package.json - Added three + @types/three

## Getting started

cd signpen && npm install && npm run dev

## Rust backend migration (parity mode)

The Next.js backend endpoints are now proxy-capable and can delegate to a Rust service while preserving client contracts.

### Implemented parity endpoints

- `GET /api/ip` -> returns `{ "ip": string }`
- `POST /api/sentiment-summary` -> accepts `{ "signatures": string[] }`, returns `{ "sentimentSummary": string }`
- `POST /api/signatures` -> accepts a signature payload and writes to Firestore after Firebase token verification

### Run the Rust backend

1. `cd backend-rust`
2. Set env vars:
	- `GOOGLE_API_KEY` (required)
	- `GEMINI_MODEL` (optional, defaults to `gemini-2.5-flash`)
	- `FIREBASE_WEB_API_KEY` (required)
	- `FIREBASE_PROJECT_ID` (required)
	- `PORT` (optional, defaults to `8080`)
3. Start service: `cargo run`

### Connect Next.js to Rust backend

Set `RUST_BACKEND_URL=http://127.0.0.1:8080` in your app environment and run Next.js as usual.

`RUST_BACKEND_URL` is required. If Rust is unavailable, API routes return `502/503` so backend ownership remains fully on Rust.
