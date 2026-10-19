export interface Tag {
  id: string
  title: string
  slug: string
  description: string
  publish_status: string
  tenant_id: string
}

export interface Category {
  id: string
  title: string
  slug: string
  description: string
  publish_status: string
  tenant_id: string
}

export interface TagForm {
  name: string
  slug: string
  description?: string
  is_active: boolean
}

export interface CategoryForm {
  id: string
  title: string
  slug: string
  description: string
  publish_status: string
}

export interface TagUpdateForm extends TagForm {
  id: string
}

export interface CategoryUpdateForm extends CategoryForm {
  id: string
}

export interface Article {
  id: string
  title: string
  slug: string
  content: string
  excerpt?: string
  featured_image: string
  is_published: boolean
  is_public: boolean
  published_at?: string
  created_at?: string
  updated_at?: string
  tenant_id?: string
  author_id?: string
  category_id: string
  meta_description: string
  status: string
}

export interface ArticleForm {
  title: string
  slug: string
  content: string
  excerpt?: string
  featured_image: string
  is_published: boolean
  is_public: boolean
  published_at?: string
  category_id: string
  tags: string[]
  meta_description: string
  status: string
}

export interface ArticleUpdateForm extends ArticleForm {
  id: string
}

export type ArticlePublishStatus = 'published' | 'draft' | 'arquived' | 'scheduled'

/** Rows as stored in Supabase (`articles`, `articles_category`, `articles_tag`, `articles_tag_relations`). */
export interface TenantScopedRecord {
  id: number
  tenant_id: string
}

export interface ArticleRecord extends TenantScopedRecord {
  title: string | null
  slug: string | null
  content: string | null
  meta_description: string | null
  publish_status: ArticlePublishStatus | null
  category_id: number | null
  author_id: string | null
  thumb_url: string | null
  created_at: string
  update_at: string | null
}

export interface ArticleTermRecord extends TenantScopedRecord {
  title: string | null
  slug: string | null
  description: string | null
  publish_status: ArticlePublishStatus | null
  created_at: string
}

export interface ArticleTagRelationRecord extends TenantScopedRecord {
  article_id: number | null
  tag_id: number | null
  created_at: string
}

export interface ValidationError {
  message: string
  field?: string
}
