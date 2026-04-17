/* eslint-disable no-console, @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion */

import { AdminConfig } from './admin.types';
import { KvrocksStorage } from './kvrocks.db';
import { RedisStorage } from './redis.db';
import {
  Favorite,
  IStorage,
  InviteCodeRecord,
  PlayRecord,
  SkipConfig,
} from './types';
import { UpstashRedisStorage } from './upstash.db';

// storage type 常量: 'localstorage' | 'redis' | 'upstash'，默认 'localstorage'
const STORAGE_TYPE =
  (process.env.NEXT_PUBLIC_STORAGE_TYPE as
    | 'localstorage'
    | 'redis'
    | 'upstash'
    | 'kvrocks'
    | undefined) || 'localstorage';

// 创建存储实例
function createStorage(): IStorage | null {
  switch (STORAGE_TYPE) {
    case 'redis':
      return new RedisStorage();
    case 'upstash':
      return new UpstashRedisStorage();
    case 'kvrocks':
      return new KvrocksStorage();
    case 'localstorage':
    default:
      return null;
  }
}

// 单例存储实例
let storageInstance: IStorage | null = null;

function getStorage(): IStorage | null {
  if (!storageInstance) {
    storageInstance = createStorage();
  }
  return storageInstance;
}

// 工具函数：生成存储key
export function generateStorageKey(source: string, id: string): string {
  return `${source}+${id}`;
}

// 导出便捷方法
export class DbManager {
  private storage: IStorage | null;

  constructor() {
    this.storage = getStorage();
  }

  private getRequiredStorage(): IStorage {
    if (!this.storage) {
      throw new Error('当前存储类型不支持数据库操作');
    }
    return this.storage;
  }

  // 播放记录相关方法
  async getPlayRecord(
    userName: string,
    source: string,
    id: string
  ): Promise<PlayRecord | null> {
    const storage = this.getRequiredStorage();
    const key = generateStorageKey(source, id);
    return storage.getPlayRecord(userName, key);
  }

  async savePlayRecord(
    userName: string,
    source: string,
    id: string,
    record: PlayRecord
  ): Promise<void> {
    const storage = this.getRequiredStorage();
    const key = generateStorageKey(source, id);
    await storage.setPlayRecord(userName, key, record);
  }

  async getAllPlayRecords(userName: string): Promise<{
    [key: string]: PlayRecord;
  }> {
    return this.getRequiredStorage().getAllPlayRecords(userName);
  }

  async deletePlayRecord(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    const storage = this.getRequiredStorage();
    const key = generateStorageKey(source, id);
    await storage.deletePlayRecord(userName, key);
  }

  // 收藏相关方法
  async getFavorite(
    userName: string,
    source: string,
    id: string
  ): Promise<Favorite | null> {
    const storage = this.getRequiredStorage();
    const key = generateStorageKey(source, id);
    return storage.getFavorite(userName, key);
  }

  async saveFavorite(
    userName: string,
    source: string,
    id: string,
    favorite: Favorite
  ): Promise<void> {
    const storage = this.getRequiredStorage();
    const key = generateStorageKey(source, id);
    await storage.setFavorite(userName, key, favorite);
  }

  async getAllFavorites(
    userName: string
  ): Promise<{ [key: string]: Favorite }> {
    return this.getRequiredStorage().getAllFavorites(userName);
  }

  async deleteFavorite(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    const storage = this.getRequiredStorage();
    const key = generateStorageKey(source, id);
    await storage.deleteFavorite(userName, key);
  }

  async isFavorited(
    userName: string,
    source: string,
    id: string
  ): Promise<boolean> {
    const favorite = await this.getFavorite(userName, source, id);
    return favorite !== null;
  }

  // ---------- 用户相关 ----------
  async registerUser(userName: string, password: string): Promise<void> {
    await this.getRequiredStorage().registerUser(userName, password);
  }

  async verifyUser(userName: string, password: string): Promise<boolean> {
    return this.getRequiredStorage().verifyUser(userName, password);
  }

  // 检查用户是否已存在
  async checkUserExist(userName: string): Promise<boolean> {
    return this.getRequiredStorage().checkUserExist(userName);
  }

  async changePassword(userName: string, newPassword: string): Promise<void> {
    await this.getRequiredStorage().changePassword(userName, newPassword);
  }

  async deleteUser(userName: string): Promise<void> {
    await this.getRequiredStorage().deleteUser(userName);
  }

  // ---------- 搜索历史 ----------
  async getSearchHistory(userName: string): Promise<string[]> {
    return this.getRequiredStorage().getSearchHistory(userName);
  }

  async addSearchHistory(userName: string, keyword: string): Promise<void> {
    await this.getRequiredStorage().addSearchHistory(userName, keyword);
  }

  async deleteSearchHistory(userName: string, keyword?: string): Promise<void> {
    await this.getRequiredStorage().deleteSearchHistory(userName, keyword);
  }

  // 获取全部用户名
  async getAllUsers(): Promise<string[]> {
    const storage = this.storage;
    if (storage && typeof (storage as any).getAllUsers === 'function') {
      return (storage as any).getAllUsers();
    }
    return [];
  }

  // ---------- 管理员配置 ----------
  async getAdminConfig(): Promise<AdminConfig | null> {
    const storage = this.storage;
    if (storage && typeof (storage as any).getAdminConfig === 'function') {
      return (storage as any).getAdminConfig();
    }
    return null;
  }

  async saveAdminConfig(config: AdminConfig): Promise<void> {
    const storage = this.storage;
    if (storage && typeof (storage as any).setAdminConfig === 'function') {
      await (storage as any).setAdminConfig(config);
    }
  }

  // ---------- 邀请码 ----------
  async getInviteCode(code: string): Promise<InviteCodeRecord | null> {
    const storage = this.storage;
    if (storage && typeof (storage as any).getInviteCode === 'function') {
      return (storage as any).getInviteCode(code);
    }
    return null;
  }

  async getAllInviteCodes(): Promise<InviteCodeRecord[]> {
    const storage = this.storage;
    if (storage && typeof (storage as any).getAllInviteCodes === 'function') {
      return (storage as any).getAllInviteCodes();
    }
    return [];
  }

  async saveInviteCode(record: InviteCodeRecord): Promise<void> {
    const storage = this.storage;
    if (storage && typeof (storage as any).setInviteCode === 'function') {
      await (storage as any).setInviteCode(record);
    }
  }

  async deleteInviteCode(code: string): Promise<void> {
    const storage = this.storage;
    if (storage && typeof (storage as any).deleteInviteCode === 'function') {
      await (storage as any).deleteInviteCode(code);
    }
  }

  async acquireInviteCodeLock(code: string, token: string): Promise<boolean> {
    const storage = this.storage;
    if (
      storage &&
      typeof (storage as any).acquireInviteCodeLock === 'function'
    ) {
      return (storage as any).acquireInviteCodeLock(code, token);
    }
    return false;
  }

  async releaseInviteCodeLock(code: string, token: string): Promise<void> {
    const storage = this.storage;
    if (
      storage &&
      typeof (storage as any).releaseInviteCodeLock === 'function'
    ) {
      await (storage as any).releaseInviteCodeLock(code, token);
    }
  }

  // ---------- 跳过片头片尾配置 ----------
  async getSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<SkipConfig | null> {
    const storage = this.storage;
    if (storage && typeof (storage as any).getSkipConfig === 'function') {
      return (storage as any).getSkipConfig(userName, source, id);
    }
    return null;
  }

  async setSkipConfig(
    userName: string,
    source: string,
    id: string,
    config: SkipConfig
  ): Promise<void> {
    const storage = this.storage;
    if (storage && typeof (storage as any).setSkipConfig === 'function') {
      await (storage as any).setSkipConfig(userName, source, id, config);
    }
  }

  async deleteSkipConfig(
    userName: string,
    source: string,
    id: string
  ): Promise<void> {
    const storage = this.storage;
    if (storage && typeof (storage as any).deleteSkipConfig === 'function') {
      await (storage as any).deleteSkipConfig(userName, source, id);
    }
  }

  async getAllSkipConfigs(
    userName: string
  ): Promise<{ [key: string]: SkipConfig }> {
    const storage = this.storage;
    if (storage && typeof (storage as any).getAllSkipConfigs === 'function') {
      return (storage as any).getAllSkipConfigs(userName);
    }
    return {};
  }

  // ---------- 数据清理 ----------
  async clearAllData(): Promise<void> {
    const storage = this.storage;
    if (storage && typeof (storage as any).clearAllData === 'function') {
      await (storage as any).clearAllData();
    } else {
      throw new Error('存储类型不支持清空数据操作');
    }
  }
}

// 导出默认实例
export const db = new DbManager();
