import type { components } from './api.generated';

// I18nField is already exported by ./category — reference it locally without
// re-exporting to avoid an ambiguous barrel re-export.
type I18nField = components['schemas']['I18nField'];
export type Announcement = components['schemas']['Announcement'];
export type AnnouncementType = Announcement['type'];

export interface ListAnnouncementsResponse {
  items: Announcement[];
}

export interface CreateAnnouncementRequest {
  title: I18nField;
  body: I18nField;
  type?: AnnouncementType;
  isActive?: boolean;
  activeFrom?: string | null;
  activeTo?: string | null;
}

export interface UpdateAnnouncementRequest {
  title?: I18nField;
  body?: I18nField;
  type?: AnnouncementType;
  isActive?: boolean;
  activeFrom?: string | null;
  activeTo?: string | null;
}
