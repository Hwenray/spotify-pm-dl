import axios from 'axios';
import { FullTrackInfo } from '../sp-script/spotify.js';
import { audioDownloadManager } from '../dl-script/download-manager.js';

export interface OriginalMetaProposal {
  title?: string;
  artist?: string;
  album?: string;
  albumArtist?: string;
}

const MB_BASE = 'https://musicbrainz.org/ws/2';
const MB_HEADERS = {
  'User-Agent': 'spotify-pm-dl/1.0 (https://github.com/hwenray/spotify-pm-dl)'.slice(0, 255),
  'Accept': 'application/json',
};

async function queryMBRecordingByISRC(isrc: string): Promise<any[] | null> {
  try {
    // 直接用 isrc 参数
    const url = `${MB_BASE}/recording?isrc=${encodeURIComponent(isrc)}&fmt=json`;
    const resp = await axios.get(url, { headers: MB_HEADERS, timeout: 10000 });
    const recs = resp.data?.recordings;
    if (Array.isArray(recs) && recs.length > 0) return recs;
  } catch {}
  try {
    // 退回到 query 搜索
    const url2 = `${MB_BASE}/recording?query=${encodeURIComponent(`isrc:${isrc}`)}&fmt=json`;
    const resp2 = await axios.get(url2, { headers: MB_HEADERS, timeout: 10000 });
    const recs2 = resp2.data?.recordings;
    if (Array.isArray(recs2) && recs2.length > 0) return recs2;
  } catch {}
  return null;
}

async function queryMBRecordingByArtistTitle(artist: string, title: string): Promise<any[] | null> {
  try {
    const q = `artist:"${artist}" AND recording:"${title}"`;
    const url = `${MB_BASE}/recording?query=${encodeURIComponent(q)}&fmt=json`;
    const resp = await axios.get(url, { headers: MB_HEADERS, timeout: 10000 });
    const recs = resp.data?.recordings;
    if (Array.isArray(recs) && recs.length > 0) return recs;
  } catch {}
  return null;
}

function pickOriginalFromRecording(rec: any): OriginalMetaProposal {
  const title: string | undefined = rec?.title ?? undefined;
  const artist: string | undefined = Array.isArray(rec?.['artist-credit'])
    ? rec['artist-credit'].map((ac: any) => ac?.name || ac?.artist?.name).filter(Boolean).join(', ')
    : undefined;
  let album: string | undefined = undefined;
  if (Array.isArray(rec?.releases) && rec.releases.length > 0) {
    // 优先 status official
    const off = rec.releases.find((r: any) => (r?.status || '').toLowerCase() === 'official');
    album = (off?.title || rec.releases[0]?.title) ?? undefined;
  }
  const albumArtist = artist; // 缺少更丰富信息时先用演唱者
  return { title, artist, album, albumArtist };
}

export async function proposeOriginalMetadata(spotify: FullTrackInfo, kugouMetadata?: { title: string; artist: string; album: string }): Promise<OriginalMetaProposal | null> {
  // 如果有酷狗元数据，优先使用
  if (kugouMetadata) {
    const proposal: OriginalMetaProposal = {};
    
    if (kugouMetadata.title && kugouMetadata.title !== spotify.title) {
      proposal.title = kugouMetadata.title;
    }
    
    if (kugouMetadata.artist && kugouMetadata.artist !== spotify.artist) {
      proposal.artist = kugouMetadata.artist;
    }
    
    if (kugouMetadata.album && kugouMetadata.album !== spotify.album) {
      proposal.album = kugouMetadata.album;
    }
    
    // 只有当有不同时才返回提议
    if (Object.keys(proposal).length > 0) {
      return proposal;
    }
  }
  
  // 先尝试从 MusicBrainz 获取
  let proposal = await proposeOriginalMetadataFromMB(spotify);
  
  // 如果 MusicBrainz 没有找到，再尝试酷狗音乐
  if (!proposal && await audioDownloadManager.isKugouAvailable()) {
    proposal = await proposeOriginalMetadataFromKugou(spotify);
  }
  
  return proposal;
}

// 从 MusicBrainz 获取原始元数据
export async function proposeOriginalMetadataFromMB(spotify: FullTrackInfo): Promise<OriginalMetaProposal | null> {
  // 优先使用 ISRC 来定位
  if (spotify.isrc) {
    const recs = await queryMBRecordingByISRC(spotify.isrc);
    if (recs && recs.length > 0) return pickOriginalFromRecording(recs[0]);
  }
  // 退回到按歌手+标题搜索
  const recs2 = await queryMBRecordingByArtistTitle(spotify.artist, spotify.title);
  if (recs2 && recs2.length > 0) return pickOriginalFromRecording(recs2[0]);
  return null;
}

// 从酷狗音乐获取原始元数据
export async function proposeOriginalMetadataFromKugou(spotify: FullTrackInfo): Promise<OriginalMetaProposal | null> {
  try {
    // 在酷狗中搜索相关歌曲
    const kugouResults = await audioDownloadManager.searchInKugou(spotify.artist, spotify.title);
    
    if (!kugouResults || kugouResults.length === 0) {
      return null;
    }
    
    // 选择最匹配的结果返回
    const bestMatch = kugouResults[0];
    
    // 检查是否与 Spotify 数据不同（只返回不同的部分）
    const proposal: OriginalMetaProposal = {};
    
    if (bestMatch.title && bestMatch.title !== spotify.title) {
      proposal.title = bestMatch.title;
    }
    
    if (bestMatch.artist && bestMatch.artist !== spotify.artist) {
      proposal.artist = bestMatch.artist;
    }
    
    if (bestMatch.album && bestMatch.album !== spotify.album) {
      proposal.album = bestMatch.album;
    }
    
    // 只有当有不同时才返回提议
    if (Object.keys(proposal).length > 0) {
      return proposal;
    }
    
    return null;
  } catch (error: any) {
    console.log(`酷狗元数据查询失败: ${error.message}`);
    return null;
  }
}

