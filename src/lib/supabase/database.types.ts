/**
 * Hand-maintained types mirroring
 * supabase/migrations/20260717000000_phase2_core_schema.sql.
 *
 * No Supabase CLI is set up in this environment yet, so these are not
 * CLI-generated. Keep this file in sync by hand whenever a migration
 * changes the schema; switch to `supabase gen types typescript` once
 * the CLI is linked to a project (see README.md).
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type AuditDepth = "discovery_only" | "basic" | "deep";

export type AuditJobStatus =
  | "pending"
  | "queued"
  | "discovering"
  | "auditing"
  | "completed"
  | "partial"
  | "failed"
  | "skipped";

// Informational only — audit_jobs.status remains the sole source of
// truth for queued/running/terminal. See the Phase 9.5 migration and
// CLAUDE.md for the full rationale.
export type AuditProgressStage =
  | "claiming"
  | "checking_reachability"
  | "analyzing_website"
  | "saving_results"
  | "calculating_score"
  | "completed"
  | "partial"
  | "failed";

export type AuditStatus = "completed" | "partial" | "failed";

export type FindingCategory =
  | "performance"
  | "accessibility"
  | "seo"
  | "conversion"
  | "technical"
  | "trust"
  | "contact"
  | "freshness"
  | "content"
  | "local_consistency"
  | "technology"
  | "broken_link";

export type FindingSeverity = "info" | "low" | "medium" | "high" | "critical";

export type FindingConfidence = "verified" | "likely" | "manual_review";

export type FindingStatus = "active" | "verified" | "dismissed";

export type DeviceType = "mobile" | "desktop";

export type SearchStatus = "pending" | "completed" | "partial" | "failed";

// Phase 11. Fully permissive transitions — this is a manual,
// single-operator tool, not an enforced workflow. See CLAUDE.md.
export type LeadStatus =
  | "new"
  | "reviewing"
  | "qualified"
  | "outreach_ready"
  | "contacted"
  | "replied"
  | "follow_up"
  | "won"
  | "lost"
  | "not_a_fit";

// Entirely manual — never inferred from audit score, Google rating,
// review count, source, website reachability, or finding severity.
export type LeadPriority = "low" | "medium" | "high";

export type Database = {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string;
          google_place_id: string | null;
          name: string;
          city: string | null;
          state: string | null;
          phone: string | null;
          source: string;
          primary_category: string | null;
          categories: string[] | null;
          address: string | null;
          zip: string | null;
          lat: number | null;
          lng: number | null;
          google_rating: number | null;
          google_review_count: number | null;
          google_maps_url: string | null;
          opening_hours: Json | null;
          business_status: string | null;
          phone_normalized: string | null;
          last_places_sync_at: string | null;
          is_test: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          google_place_id?: string | null;
          name: string;
          city?: string | null;
          state?: string | null;
          phone?: string | null;
          source?: string;
          primary_category?: string | null;
          categories?: string[] | null;
          address?: string | null;
          zip?: string | null;
          lat?: number | null;
          lng?: number | null;
          google_rating?: number | null;
          google_review_count?: number | null;
          google_maps_url?: string | null;
          opening_hours?: Json | null;
          business_status?: string | null;
          phone_normalized?: string | null;
          last_places_sync_at?: string | null;
          is_test?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          google_place_id?: string | null;
          name?: string;
          city?: string | null;
          state?: string | null;
          phone?: string | null;
          source?: string;
          primary_category?: string | null;
          categories?: string[] | null;
          address?: string | null;
          zip?: string | null;
          lat?: number | null;
          lng?: number | null;
          google_rating?: number | null;
          google_review_count?: number | null;
          google_maps_url?: string | null;
          opening_hours?: Json | null;
          business_status?: string | null;
          phone_normalized?: string | null;
          last_places_sync_at?: string | null;
          is_test?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      websites: {
        Row: {
          id: string;
          business_id: string;
          input_url: string;
          final_url: string | null;
          root_domain: string | null;
          is_reachable: boolean | null;
          http_status: number | null;
          https_enabled: boolean | null;
          redirect_count: number | null;
          redirect_chain: Json | null;
          http_to_https_redirect: boolean | null;
          failure_reason: string | null;
          last_checked_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          input_url: string;
          final_url?: string | null;
          root_domain?: string | null;
          is_reachable?: boolean | null;
          http_status?: number | null;
          https_enabled?: boolean | null;
          redirect_count?: number | null;
          redirect_chain?: Json | null;
          http_to_https_redirect?: boolean | null;
          failure_reason?: string | null;
          last_checked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          input_url?: string;
          final_url?: string | null;
          root_domain?: string | null;
          is_reachable?: boolean | null;
          http_status?: number | null;
          https_enabled?: boolean | null;
          redirect_count?: number | null;
          redirect_chain?: Json | null;
          http_to_https_redirect?: boolean | null;
          failure_reason?: string | null;
          last_checked_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "websites_business_id_fkey";
            columns: ["business_id"];
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };

      audit_jobs: {
        Row: {
          id: string;
          business_id: string;
          website_id: string;
          audit_depth: AuditDepth;
          status: AuditJobStatus;
          attempt: number;
          claimed_by: string | null;
          claimed_at: string | null;
          idempotency_key: string | null;
          error_message: string | null;
          progress_stage: AuditProgressStage | null;
          progress_updated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          website_id: string;
          audit_depth: AuditDepth;
          status?: AuditJobStatus;
          attempt?: number;
          claimed_by?: string | null;
          claimed_at?: string | null;
          idempotency_key?: string | null;
          error_message?: string | null;
          progress_stage?: AuditProgressStage | null;
          progress_updated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          website_id?: string;
          audit_depth?: AuditDepth;
          status?: AuditJobStatus;
          attempt?: number;
          claimed_by?: string | null;
          claimed_at?: string | null;
          idempotency_key?: string | null;
          error_message?: string | null;
          progress_stage?: AuditProgressStage | null;
          progress_updated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_jobs_business_id_fkey";
            columns: ["business_id"];
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_jobs_website_id_fkey";
            columns: ["website_id"];
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };

      audits: {
        Row: {
          id: string;
          audit_job_id: string;
          website_id: string;
          audit_depth: AuditDepth;
          status: AuditStatus;
          raw_pagespeed_mobile: Json | null;
          raw_pagespeed_desktop: Json | null;
          pagespeed_mobile: Json | null;
          pagespeed_desktop: Json | null;
          homepage_title: string | null;
          meta_description: string | null;
          canonical_url: string | null;
          robots_meta: string | null;
          h1_text: string | null;
          h1_count: number | null;
          summary: string | null;
          started_at: string | null;
          completed_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          audit_job_id: string;
          website_id: string;
          audit_depth: AuditDepth;
          status: AuditStatus;
          raw_pagespeed_mobile?: Json | null;
          raw_pagespeed_desktop?: Json | null;
          pagespeed_mobile?: Json | null;
          pagespeed_desktop?: Json | null;
          homepage_title?: string | null;
          meta_description?: string | null;
          canonical_url?: string | null;
          robots_meta?: string | null;
          h1_text?: string | null;
          h1_count?: number | null;
          summary?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        // audits rows are immutable after creation — no update path is
        // expected in application code, but Update is still declared
        // (matching the shape Insert would produce) since the Supabase
        // client types require it.
        Update: {
          id?: string;
          audit_job_id?: string;
          website_id?: string;
          audit_depth?: AuditDepth;
          status?: AuditStatus;
          raw_pagespeed_mobile?: Json | null;
          raw_pagespeed_desktop?: Json | null;
          pagespeed_mobile?: Json | null;
          pagespeed_desktop?: Json | null;
          homepage_title?: string | null;
          meta_description?: string | null;
          canonical_url?: string | null;
          robots_meta?: string | null;
          h1_text?: string | null;
          h1_count?: number | null;
          summary?: string | null;
          started_at?: string | null;
          completed_at?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audits_audit_job_id_fkey";
            columns: ["audit_job_id"];
            referencedRelation: "audit_jobs";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audits_website_id_fkey";
            columns: ["website_id"];
            referencedRelation: "websites";
            referencedColumns: ["id"];
          },
        ];
      };

      audit_findings: {
        Row: {
          id: string;
          audit_id: string;
          business_id: string;
          category: FindingCategory;
          finding_type: string;
          title: string;
          description: string;
          evidence: string | null;
          source_url: string | null;
          source_type: string | null;
          severity: FindingSeverity;
          confidence: FindingConfidence;
          status: FindingStatus;
          raw_value: string | null;
          normalized_value: string | null;
          points: number;
          rule_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          audit_id: string;
          business_id: string;
          category: FindingCategory;
          finding_type: string;
          title: string;
          description: string;
          evidence?: string | null;
          source_url?: string | null;
          source_type?: string | null;
          severity: FindingSeverity;
          confidence: FindingConfidence;
          status?: FindingStatus;
          raw_value?: string | null;
          normalized_value?: string | null;
          points?: number;
          rule_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          audit_id?: string;
          business_id?: string;
          category?: FindingCategory;
          finding_type?: string;
          title?: string;
          description?: string;
          evidence?: string | null;
          source_url?: string | null;
          source_type?: string | null;
          severity?: FindingSeverity;
          confidence?: FindingConfidence;
          status?: FindingStatus;
          raw_value?: string | null;
          normalized_value?: string | null;
          points?: number;
          rule_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_findings_audit_id_fkey";
            columns: ["audit_id"];
            referencedRelation: "audits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "audit_findings_business_id_fkey";
            columns: ["business_id"];
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };

      audit_scores: {
        Row: {
          id: string;
          audit_id: string;
          website_need_score: number | null;
          business_value_score: number | null;
          contactability_score: number | null;
          priority_score: number | null;
          breakdown: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          audit_id: string;
          website_need_score?: number | null;
          business_value_score?: number | null;
          contactability_score?: number | null;
          priority_score?: number | null;
          breakdown?: Json | null;
          created_at?: string;
        };
        // audit_scores rows are immutable after creation — see the note
        // on audits.Update above; the same reasoning applies here.
        Update: {
          id?: string;
          audit_id?: string;
          website_need_score?: number | null;
          business_value_score?: number | null;
          contactability_score?: number | null;
          priority_score?: number | null;
          breakdown?: Json | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_scores_audit_id_fkey";
            columns: ["audit_id"];
            referencedRelation: "audits";
            referencedColumns: ["id"];
          },
        ];
      };

      screenshots: {
        Row: {
          id: string;
          audit_id: string;
          business_id: string;
          device_type: DeviceType;
          page_url: string;
          storage_path: string;
          viewport_width: number;
          viewport_height: number;
          full_page: boolean;
          captured_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          audit_id: string;
          business_id: string;
          device_type: DeviceType;
          page_url: string;
          storage_path: string;
          viewport_width: number;
          viewport_height: number;
          full_page?: boolean;
          captured_at?: string;
          created_at?: string;
        };
        // screenshots rows are immutable after creation — a device
        // type either has one row (successfully captured) or none
        // (not yet captured / failed); nothing is ever updated in
        // place, only inserted.
        Update: {
          id?: string;
          audit_id?: string;
          business_id?: string;
          device_type?: DeviceType;
          page_url?: string;
          storage_path?: string;
          viewport_width?: number;
          viewport_height?: number;
          full_page?: boolean;
          captured_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "screenshots_audit_id_fkey";
            columns: ["audit_id"];
            referencedRelation: "audits";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "screenshots_business_id_fkey";
            columns: ["business_id"];
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };

      searches: {
        Row: {
          id: string;
          niche: string;
          city: string;
          state: string;
          zip: string | null;
          max_results: number;
          min_rating: number | null;
          min_reviews: number | null;
          exclude_no_website: boolean;
          status: SearchStatus;
          businesses_found: number;
          businesses_imported: number;
          businesses_filtered: number;
          businesses_without_website: number;
          error_message: string | null;
          is_test: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          niche: string;
          city: string;
          state: string;
          zip?: string | null;
          max_results?: number;
          min_rating?: number | null;
          min_reviews?: number | null;
          exclude_no_website?: boolean;
          status?: SearchStatus;
          businesses_found?: number;
          businesses_imported?: number;
          businesses_filtered?: number;
          businesses_without_website?: number;
          error_message?: string | null;
          is_test?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          niche?: string;
          city?: string;
          state?: string;
          zip?: string | null;
          max_results?: number;
          min_rating?: number | null;
          min_reviews?: number | null;
          exclude_no_website?: boolean;
          status?: SearchStatus;
          businesses_found?: number;
          businesses_imported?: number;
          businesses_filtered?: number;
          businesses_without_website?: number;
          error_message?: string | null;
          is_test?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [];
      };

      search_businesses: {
        Row: {
          id: string;
          search_id: string;
          business_id: string;
          rank_in_search: number | null;
          is_new_business: boolean;
          duplicate_warning: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          search_id: string;
          business_id: string;
          rank_in_search?: number | null;
          is_new_business?: boolean;
          duplicate_warning?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          search_id?: string;
          business_id?: string;
          rank_in_search?: number | null;
          is_new_business?: boolean;
          duplicate_warning?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "search_businesses_search_id_fkey";
            columns: ["search_id"];
            referencedRelation: "searches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "search_businesses_business_id_fkey";
            columns: ["business_id"];
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };

      lead_profiles: {
        Row: {
          business_id: string;
          status: LeadStatus;
          priority: LeadPriority | null;
          notes: string | null;
          outreach_angle: string | null;
          last_contacted_date: string | null;
          next_follow_up_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          business_id: string;
          status?: LeadStatus;
          priority?: LeadPriority | null;
          notes?: string | null;
          outreach_angle?: string | null;
          last_contacted_date?: string | null;
          next_follow_up_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          business_id?: string;
          status?: LeadStatus;
          priority?: LeadPriority | null;
          notes?: string | null;
          outreach_angle?: string | null;
          last_contacted_date?: string | null;
          next_follow_up_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_profiles_business_id_fkey";
            columns: ["business_id"];
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };

      // Append-only — written exclusively by the lead_profiles_log_status_change
      // trigger. Application code never inserts, updates, or deletes here directly.
      lead_activity: {
        Row: {
          id: string;
          business_id: string;
          from_status: LeadStatus | null;
          to_status: LeadStatus;
          note: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          business_id: string;
          from_status?: LeadStatus | null;
          to_status: LeadStatus;
          note?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          business_id?: string;
          from_status?: LeadStatus | null;
          to_status?: LeadStatus;
          note?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "lead_activity_business_id_fkey";
            columns: ["business_id"];
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export type Business = Database["public"]["Tables"]["businesses"]["Row"];
export type BusinessInsert = Database["public"]["Tables"]["businesses"]["Insert"];
export type BusinessUpdate = Database["public"]["Tables"]["businesses"]["Update"];

export type Website = Database["public"]["Tables"]["websites"]["Row"];
export type WebsiteInsert = Database["public"]["Tables"]["websites"]["Insert"];
export type WebsiteUpdate = Database["public"]["Tables"]["websites"]["Update"];

export type AuditJob = Database["public"]["Tables"]["audit_jobs"]["Row"];
export type AuditJobInsert = Database["public"]["Tables"]["audit_jobs"]["Insert"];
export type AuditJobUpdate = Database["public"]["Tables"]["audit_jobs"]["Update"];

export type Audit = Database["public"]["Tables"]["audits"]["Row"];
export type AuditInsert = Database["public"]["Tables"]["audits"]["Insert"];

export type AuditFinding = Database["public"]["Tables"]["audit_findings"]["Row"];
export type AuditFindingInsert = Database["public"]["Tables"]["audit_findings"]["Insert"];
export type AuditFindingUpdate = Database["public"]["Tables"]["audit_findings"]["Update"];

export type AuditScore = Database["public"]["Tables"]["audit_scores"]["Row"];
export type AuditScoreInsert = Database["public"]["Tables"]["audit_scores"]["Insert"];

export type Screenshot = Database["public"]["Tables"]["screenshots"]["Row"];
export type ScreenshotInsert = Database["public"]["Tables"]["screenshots"]["Insert"];

export type LeadProfile = Database["public"]["Tables"]["lead_profiles"]["Row"];
export type LeadProfileUpdate = Database["public"]["Tables"]["lead_profiles"]["Update"];

export type LeadActivity = Database["public"]["Tables"]["lead_activity"]["Row"];

export type Search = Database["public"]["Tables"]["searches"]["Row"];
export type SearchInsert = Database["public"]["Tables"]["searches"]["Insert"];
export type SearchUpdate = Database["public"]["Tables"]["searches"]["Update"];
