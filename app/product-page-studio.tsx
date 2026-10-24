"use client";
import type {Product} from '@/lib/product';
import {SalesPageEditor} from './sales-page-editor';
export type ProductPageStudioProps = {
  product: Product;
  mode: "creator" | "member";
  onModeChange: (mode: "creator" | "member") => void;
  onDirtyChange?: (dirty: boolean) => void;
  onBusyChange?: (busy: boolean) => void;
  initialTab?: "home" | "content" | "reviews";
  editingRequested?: number;
  onBrandingChange?: (iconUploadId: string | null) => void;
  onProductDetails?: () => void;
  onRegisterSave?: (save:(()=>Promise<void>)|null)=>void;
};
export function ProductPageStudio(props:ProductPageStudioProps){return <SalesPageEditor key={props.product.id} {...props}/>;}
