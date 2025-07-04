
import dotenv from 'dotenv';
import path from 'path';
//import { fileURLToPath } from 'url';
//const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);
//const envPath = path.resolve(__dirname, '..', '.env');
//dotenv.config({ path: envPath });
dotenv.config();

export const config = {
  clientId: process.env.SPOTIFY_CLIENT_ID!,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET!,
  aria2Url: process.env.ARIA2_RPC_URL || 'http://localhost:6800/jsonrpc',
  aria2Token: process.env.ARIA2_TOKEN || '',
  downloadDir: process.env.DOWNLOAD_DIR || path.resolve('downloads'),
};
