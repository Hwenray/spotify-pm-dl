import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

async function testSpotifyAuth() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

  const tokenUrl = 'https://accounts.spotify.com/api/token';
  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  try {
    const response = await axios.post(tokenUrl, 'grant_type=client_credentials', {
      headers: {
        Authorization: `Basic ${authHeader}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    });

    console.log('✅ 成功获取 Access Token：', response.data.access_token);
  } catch (error) {
    console.error('❌ 获取失败：', error.response?.data || error.message);
  }
}

testSpotifyAuth();