import axios from 'axios';
import { SpotifyPlaylistResponse, SpotifyTokenResponse, SpotifyTrackItem } from '../types.js';
import { config } from '../config.js';

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

/**
 * 通过 Spotify track URL 或 ID 获取元数据（标题与艺术家）。
 */
export async function getTrackInfoFromUrl(
  trackUrlOrId: string,
  accessToken: string
): Promise<{ title: string; artist: string } | null> {
  // 提取 track id
  let trackId = trackUrlOrId;
  const urlMatch = trackUrlOrId.match(/track\/([a-zA-Z0-9]+)/);
  if (urlMatch) {
    trackId = urlMatch[1];
  }
  // 兼容 spotify:track:ID 形式
  const uriMatch = trackUrlOrId.match(/spotify:track:([a-zA-Z0-9]+)/);
  if (uriMatch) {
    trackId = uriMatch[1];
  }

  try {
    const response = await axios.get(`https://api.spotify.com/v1/tracks/${trackId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = response.data;
    const title: string = data.name;
    const artist: string = data.artists.map((a: any) => a.name).join(', ');
    return { title, artist };
  } catch (error: any) {
    console.error('获取单曲信息失败：', error.message);
    return null;
  }
}

/**
 * 获取专辑/EP中所有歌曲及专辑名
 */
export async function getAlbumTracks(
  albumId: string,
  accessToken: string
): Promise<{ name: string; tracks: string[] }> {
  const tracks: string[] = [];
  let albumName = '';

  try {
    let url = `https://api.spotify.com/v1/albums/${albumId}`;
    const albumResponse = await axios.get(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    albumName = albumResponse.data.name;
    let items = albumResponse.data.tracks.items;
    tracks.push(
      ...items.map((item: any) => item.external_urls.spotify ?? item.track?.external_urls?.spotify)
            .filter((u: string | undefined) => Boolean(u))
    );

    // 分页
    let nextUrl = albumResponse.data.tracks.next;
    while (nextUrl) {
      const resp = await axios.get(nextUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      items = resp.data.items;
      tracks.push(
        ...items.map((item: any) => item.external_urls.spotify ?? item.track?.external_urls?.spotify)
              .filter((u: string | undefined) => Boolean(u))
      );
      nextUrl = resp.data.next;
    }
  } catch (error: any) {
    console.error('获取专辑失败：', error.message);
  }

  return { name: albumName, tracks };
}