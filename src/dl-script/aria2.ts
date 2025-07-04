import axios from 'axios';
import { config } from '../config.js';

export async function addToAria2(downloadLink: string, fileName: string): Promise<void> {
  const payload = {
    jsonrpc: '2.0',
    id: '1',
    method: 'aria2.addUri',
    params: [
      `token:${config.aria2Token}`,
      [downloadLink],
      {
        out: fileName,
        dir: config.downloadDir,
      },
    ],
  };

  try {
    const response = await axios.post(config.aria2Url, payload, {
      headers: { 'Content-Type': 'application/json' },
    });
    console.log(`Aria2 添加成功：${response.data.result}`);
  } catch (error: any) {
    console.error(`添加失败：${error.message}`);
  }
}