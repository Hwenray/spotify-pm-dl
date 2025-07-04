import axios from 'axios';
import { SpotifyPlaylistResponse, SpotifyTokenResponse, SpotifyTrackItem } from './types.js';
import { config } from './config.js';

// 搜索结果类型定义
export interface SearchResult {
  title: string;
  artist: string;
  trackUrl: string;
}

/**
 * 使用关键词搜索 Spotify 歌曲。
 */
export async function searchTracks(query: string, accessToken: string): Promise<SearchResult[]> {
  try {
    const response = await axios.get(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    const tracks = response.data.tracks.items;

    if (tracks.length === 0) {
      console.log('未找到相关歌曲。');
      return [];
    }

    return tracks.map((track: any) => ({
      title: track.name,
      artist: track.artists.map((artist: any) => artist.name).join(', '),
      trackUrl: track.external_urls.spotify,
    }));
  } catch (error: any) {
    console.error('搜索失败:', error.message);
    return [];
  }
}

/**
 * 获取 Spotify API 的访问令牌
 */
export async function getAccessToken(): Promise<string | null> {
  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      'grant_type=client_credentials',
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        },
      }
    );
    return response.data.access_token;
  } catch (error: any) {
    console.error('获取访问令牌失败：', error.message);
    return null;
  }
}

/**
 * 获取指定歌单中的所有歌曲及歌单名
 */
export async function getPlaylistTracks(
  playlistId: string,
  accessToken: string
): Promise<{ name: string; tracks: string[] }> {
  const tracks: string[] = [];
  let playlistName = '';
  const playlistUrl = `https://api.spotify.com/v1/playlists/${playlistId}`;

  try {
    const playlistResponse = await axios.get(playlistUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    playlistName = playlistResponse.data.name;
    const initialTracks = playlistResponse.data.tracks;

    tracks.push(
      ...initialTracks.items.map((item: SpotifyTrackItem) => item.track.external_urls.spotify)
    );

    let nextUrl = initialTracks.next;

    while (nextUrl) {
      const response = await axios.get(nextUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      tracks.push(
        ...response.data.items.map((item: SpotifyTrackItem) => item.track.external_urls.spotify)
      );

      nextUrl = response.data.next;
    }
  } catch (error: any) {
    console.error('获取歌单失败：', error.message);
  }

  return { name: playlistName, tracks };
}