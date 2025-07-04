
import axios from 'axios';

export async function fetchDownloadLink(url: string): Promise<{
  success: boolean;
  data?: {
    downloadLink: string;
    artist: string;
    title: string;
  };
} | null> {
  try {
    const response = await axios.post(
      'https://spotify.downloaderize.com/wp-json/spotify-downloader/v1/fetch',
      { type: 'song', url },
      { headers: { 'Content-Type': 'application/json' }, timeout: 10000 }
    );
    return response.data;
  } catch (error: any) {
    console.error(`下载失败：${error.message}`);
    return null;
  }
}