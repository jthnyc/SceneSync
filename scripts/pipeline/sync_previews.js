/**
 * sync_previews.js
 *
 * Syncs audio preview files to Cloudflare R2 based on feature_vectors.json.
 *
 * Source of truth: public/data/feature_vectors.json
 * Preview files:   data/previews/
 * Destination:     R2 bucket (scenesync-audio)
 *
 * What it does:
 *   1. Reads feature_vectors.json to determine which tracks belong in R2
 *   2. Maps each track to its preview file on disk
 *   3. Lists what's currently in the R2 bucket
 *   4. Uploads new/changed files, deletes orphaned files
 *   5. Reports what changed
 *
 * What it does NOT do:
 *   - No extraction, no curation, no trimming
 *   - No filtering by acoustic properties
 *   - No feature_vectors.json modification
 *
 * Usage:
 *   node scripts/sync_previews.js              # normal sync
 *   node scripts/sync_previews.js --dry-run    # preview changes without uploading
 *
 * Requires:
 *   npm install @aws-sdk/client-s3 dotenv
 *
 * Environment variables (in .env at project root):
 *   CLOUDFLARE_ACCOUNT_ID=your_account_id
 *   R2_ACCESS_KEY_ID=your_access_key
 *   R2_SECRET_ACCESS_KEY=your_secret_key
 */

'use strict';

const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require('@aws-sdk/client-s3');
const dotenv = require('dotenv');
const fs     = require('fs');
const path   = require('path');

dotenv.config();

// ── Configuration ─────────────────────────────────────────────────────────────

const BUCKET_NAME          = 'scenesync-audio';
const PREVIEW_DIR          = 'data/previews';
const FEATURE_VECTORS_PATH = 'public/data/feature_vectors.json';
const DRY_RUN              = process.argv.includes('--dry-run');

const R2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId:     process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// ── Path mapping ──────────────────────────────────────────────────────────────

/**
 * Maps a track's `file` field from feature_vectors.json to:
 *   - previewPath: where the preview lives on disk
 *   - r2Key: the key it should have in R2
 *
 * FMA:     file = "./data/fma_small/141/141300.mp3"
 *          preview = "data/previews/fma_small/141/141300.mp3"
 *          r2Key   = "fma_small/141/141300.mp3"
 *
 * Musopen: file = "data/musopen/Musopen DVD/Beethoven - Coriolan Overture/Coriolan Overture.mp3"
 *          preview = "data/previews/musopen/Musopen DVD/Beethoven - Coriolan Overture/Coriolan Overture.mp3"
 *          r2Key   = "musopen/Musopen DVD/Beethoven - Coriolan Overture/Coriolan Overture.mp3"
 *
 * YouTube: file = "data/youtube/batch1/filename.mp3"
 *          preview = "data/previews/youtube/batch1/filename.mp3"
 *          r2Key   = "youtube/batch1/filename.mp3"
 */
function mapTrackPaths(filePath) {
  // Normalize: strip leading "./" if present
  const normalized = filePath.replace(/^\.\//, '');

  if (normalized.startsWith('data/fma_small/')) {
    const rel = normalized.replace('data/fma_small/', '');
    return {
      previewPath: path.join(PREVIEW_DIR, 'fma_small', rel),
      r2Key:       'fma_small/' + rel,
    };
  }

  if (normalized.startsWith('data/musopen/')) {
    const rel = normalized.replace('data/musopen/', '');
    return {
      previewPath: path.join(PREVIEW_DIR, 'musopen', rel),
      r2Key:       'musopen/' + rel,
    };
  }

  // Generic handler for future sources (youtube, freesound, etc.)
  if (normalized.startsWith('data/')) {
    const rel = normalized.replace('data/', '');
    return {
      previewPath: path.join(PREVIEW_DIR, rel),
      r2Key:       rel,
    };
  }

  console.warn('  \u26a0 Unknown file path format: ' + filePath);
  return null;
}

// ── R2 operations ─────────────────────────────────────────────────────────────

/**
 * List all objects currently in the R2 bucket.
 * Handles pagination for buckets with >1000 objects.
 */
async function listBucketObjects() {
  const objects = new Map(); // key → { size, lastModified }
  let continuationToken;

  do {
    const response = await R2.send(
      new ListObjectsV2Command({
        Bucket:            BUCKET_NAME,
        ContinuationToken: continuationToken,
      })
    );

    if (response.Contents) {
      for (const obj of response.Contents) {
        objects.set(obj.Key, {
          size:         obj.Size,
          lastModified: obj.LastModified,
        });
      }
    }

    continuationToken = response.IsTruncated
      ? response.NextContinuationToken
      : undefined;
  } while (continuationToken);

  return objects;
}

/** Upload a single file to R2 with correct Content-Type for browser streaming. */
async function uploadFile(localPath, r2Key) {
  const body = fs.readFileSync(localPath);
  await R2.send(
    new PutObjectCommand({
      Bucket:      BUCKET_NAME,
      Key:         r2Key,
      Body:        body,
      ContentType: 'audio/mpeg',
    })
  );
}

/** Delete a single object from R2. */
async function deleteFile(r2Key) {
  await R2.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key:    r2Key,
    })
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('============================================');
  console.log('  SceneSync \u2014 R2 Preview Sync');
  if (DRY_RUN) console.log('  *** DRY RUN \u2014 no changes will be made ***');
  console.log('============================================\n');

  // Validate environment
  if (
    !process.env.CLOUDFLARE_ACCOUNT_ID ||
    !process.env.R2_ACCESS_KEY_ID ||
    !process.env.R2_SECRET_ACCESS_KEY
  ) {
    console.error('ERROR: Missing environment variables. Check .env file for:');
    console.error('  CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY');
    process.exit(1);
  }

  // Step 1: Read feature_vectors.json
  console.log('Reading feature_vectors.json...');
  const tracks = JSON.parse(fs.readFileSync(FEATURE_VECTORS_PATH, 'utf-8'));
  console.log('  ' + tracks.length + ' tracks in library\n');

  // Step 2: Build map of what SHOULD be in R2
  const desired = new Map(); // r2Key → previewPath
  let missingPreviews = 0;

  for (const track of tracks) {
    const mapping = mapTrackPaths(track.file);
    if (!mapping) continue;

    if (!fs.existsSync(mapping.previewPath)) {
      console.warn('  \u26a0 Preview not found: ' + mapping.previewPath);
      missingPreviews++;
      continue;
    }

    desired.set(mapping.r2Key, mapping.previewPath);
  }

  console.log('  ' + desired.size + ' tracks with previews ready for sync');
  if (missingPreviews > 0) {
    console.log('  ' + missingPreviews + ' tracks missing previews (run prepare_previews.sh first)');
  }
  console.log();

  // Step 3: List what's currently in R2
  console.log('Listing current R2 bucket contents...');
  const existing = await listBucketObjects();
  console.log('  ' + existing.size + ' objects in bucket\n');

  // Step 4: Compute diff
  const toUpload = []; // { r2Key, previewPath }
  const toDelete = []; // r2Key

  // Files that should be in R2 but aren't, or have changed size
  for (const [r2Key, previewPath] of desired) {
    const localSize = fs.statSync(previewPath).size;
    const remote    = existing.get(r2Key);

    if (!remote || remote.size !== localSize) {
      toUpload.push({ r2Key, previewPath });
    }
  }

  // Files in R2 that aren't in the desired set (orphans)
  for (const r2Key of existing.keys()) {
    if (!desired.has(r2Key)) {
      toDelete.push(r2Key);
    }
  }

  // Step 5: Report plan
  console.log('--- Sync Plan ---');
  console.log('  Upload:    ' + toUpload.length + ' files');
  console.log('  Delete:    ' + toDelete.length + ' orphaned files');
  console.log('  Unchanged: ' + (desired.size - toUpload.length) + ' files\n');

  if (toUpload.length === 0 && toDelete.length === 0) {
    console.log('  Already in sync. Nothing to do.\n');
    return;
  }

  if (DRY_RUN) {
    if (toUpload.length > 0) {
      console.log('  Would upload:');
      for (const { r2Key } of toUpload.slice(0, 10)) {
        console.log('    + ' + r2Key);
      }
      if (toUpload.length > 10)
        console.log('    ... and ' + (toUpload.length - 10) + ' more');
    }
    if (toDelete.length > 0) {
      console.log('  Would delete:');
      for (const key of toDelete.slice(0, 10)) {
        console.log('    - ' + key);
      }
      if (toDelete.length > 10)
        console.log('    ... and ' + (toDelete.length - 10) + ' more');
    }
    console.log('\n  Run without --dry-run to apply changes.\n');
    return;
  }

  // Step 6: Execute uploads
  if (toUpload.length > 0) {
    console.log('Uploading...');
    let uploaded = 0;
    let failed   = 0;

    for (const { r2Key, previewPath } of toUpload) {
      try {
        await uploadFile(previewPath, r2Key);
        uploaded++;
        if (uploaded % 10 === 0 || uploaded === toUpload.length) {
          process.stdout.write('\r  ' + uploaded + '/' + toUpload.length + ' uploaded');
        }
      } catch (err) {
        console.error('\n  \u2717 Failed: ' + r2Key + ' \u2014 ' + err.message);
        failed++;
      }
    }
    console.log('\n  \u2713 ' + uploaded + ' uploaded' + (failed > 0 ? ', ' + failed + ' failed' : '') + '\n');
  }

  // Step 7: Execute deletes
  if (toDelete.length > 0) {
    console.log('Deleting orphaned files...');
    let deleted = 0;
    let failed  = 0;

    for (const r2Key of toDelete) {
      try {
        await deleteFile(r2Key);
        deleted++;
      } catch (err) {
        console.error('  \u2717 Failed to delete: ' + r2Key + ' \u2014 ' + err.message);
        failed++;
      }
    }
    console.log('  \u2713 ' + deleted + ' deleted' + (failed > 0 ? ', ' + failed + ' failed' : '') + '\n');
  }

  // Step 8: Summary
  console.log('============================================');
  console.log('  Sync Complete');
  console.log('============================================');
  console.log('  Tracks in R2: ' + desired.size);
  console.log('  Base URL: https://pub-2014bbd27fde402e8d8cd1a67fe4fbcd.r2.dev/');
  if (toUpload.length > 0) {
    console.log('  Example:  https://pub-2014bbd27fde402e8d8cd1a67fe4fbcd.r2.dev/' + toUpload[0].r2Key);
  }
  console.log();
}

main().catch(function (err) {
  console.error('Fatal error:', err);
  process.exit(1);
});