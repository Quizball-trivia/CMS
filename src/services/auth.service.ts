import { apiClient } from './api-client';
import type { LoginRequest, LoginResponse, User } from '@/types';

export const authService = {
  async login(data: LoginRequest): Promise<LoginResponse> {
    return apiClient.postNoAuth<LoginResponse>('/auth/login', data);
  },

  async getMe(): Promise<User> {
    return apiClient.get<User>('/users/me');
  },

  async logout(): Promise<void> {
    return apiClient.post<void>('/auth/logout');
  },
};
