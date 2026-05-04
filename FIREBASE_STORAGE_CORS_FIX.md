# Firebase Storage CORS Configuration Fix

## Issue
Your Firebase Storage bucket is blocking CORS requests from the frontend, causing image access to fail with:
```
Cross-Origin Request Blocked: CORS preflight response did not succeed
```

## Solution

### Option 1: Using Firebase Console (Easiest)
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Select your project: `studio-8673642774-5bb3f`
3. Navigate to **Storage**
4. Click the **CORS** tab
5. Add the following CORS configuration:
   ```json
   [
     {
       "origin": ["*"],
       "method": ["GET", "HEAD", "DELETE", "PUT", "POST", "PATCH", "OPTIONS"],
       "responseHeader": ["Content-Type", "x-goog-meta-*", "Authorization"],
       "maxAgeSeconds": 3600
     }
   ]
   ```

### Option 2: Using Google Cloud Console
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project
3. Navigate to **Cloud Storage > Buckets**
4. Select bucket: `studio-8673642774-5bb3f.appspot.com`
5. Click **CORS** tab
6. Add the configuration above

### Option 3: Using gsutil (Command Line)
1. Install [Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
2. Run:
   ```bash
   gsutil cors set storage-cors.json gs://studio-8673642774-5bb3f.appspot.com
   ```

## CORS Configuration Explanation
- **origin: ["*"]** - Allow requests from any origin (your production domain should be more specific)
- **method** - Allow common HTTP methods for storage operations
- **responseHeader** - Allow headers needed for authentication and metadata
- **maxAgeSeconds** - Browser cache duration for preflight requests

## For Production
Replace `"origin": ["*"]` with your specific domain:
```json
"origin": ["https://yourdomain.com", "https://www.yourdomain.com"]
```

## Troubleshooting
- **Still getting 404?** The file might not exist. Check:
  - File path: `profile-photos/{userId}/{filename}`
  - User has uploaded the file successfully
  - Storage rules allow `read: if true` for profile-photos path
- **Upload still failing?** Check that user is authenticated and storage rules allow `write: if isOwner(userId)`
