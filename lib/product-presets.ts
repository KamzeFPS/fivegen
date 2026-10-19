import type { Brief } from './product';

// Presentation presets only: persisted format names and existing products stay intact.
export type ProductPresetId = 'playbook' | 'guide' | 'template-kit' | 'course' | 'video-course' | 'challenge' | 'custom-download' | 'custom-course';
export type ProductFamily = 'downloads' | 'course' | 'service';
export type ProductPreset = {
  id: ProductPresetId | 'consulting';
  label: string;
  format: Brief['format'];
  family: ProductFamily;
  description: string;
  available: boolean;
};

export const productPresets: ProductPreset[] = [
  { id: 'playbook', label: 'Playbook', format: 'Playbook', family: 'downloads', description: 'Your finished PDF, delivered as the original file.', available: true },
  { id: 'guide', label: 'Guide', format: 'Guide', family: 'downloads', description: 'A guide or ebook, with optional lessons alongside it.', available: true },
  { id: 'template-kit', label: 'Template kit', format: 'Template kit', family: 'downloads', description: 'Supported individual files. ZIP archives are not supported.', available: true },
  { id: 'course', label: 'Mini course', format: 'Mini course', family: 'course', description: 'Self-paced lessons with text and optional video.', available: true },
  { id: 'video-course', label: 'Video course', format: 'Video course', family: 'course', description: 'Upload your recordings and add lesson notes.', available: true },
  { id: 'challenge', label: 'Challenge', format: 'Challenge', family: 'course', description: 'Self-paced daily lessons. No cohort dates or drip schedule.', available: true },
  { id: 'consulting', label: 'Consulting / Mentorship', format: 'Consulting / Mentorship', family: 'service', description: 'Booking sales are not enabled in this file-selling preview.', available: false },
  { id: 'custom-download', label: 'Custom · Downloads', format: 'Custom product', family: 'downloads', description: 'Start with files, then add a course if you need one.', available: true },
  { id: 'custom-course', label: 'Custom · Course', format: 'Custom product', family: 'course', description: 'Start with lessons, then attach downloadable resources.', available: true },
];

export function productPreset(id: string): ProductPreset | undefined {
  return productPresets.find(preset => preset.id === id);
}

export const legacyProductFamilies: Record<Brief['format'], ProductFamily | 'community'> = {
  Guide: 'downloads', 'Mini course': 'course', 'Template kit': 'downloads',
  Challenge: 'course', Playbook: 'downloads', 'Custom product': 'downloads',
  'Coaching session': 'service', Community: 'community',
  'Video course': 'course', 'Consulting / Mentorship': 'service',
};
