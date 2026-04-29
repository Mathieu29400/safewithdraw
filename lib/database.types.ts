/**
 * Types of the SafeWithdraw Supabase database (`public` schema).
 *
 * These mirror `supabase/schema.sql`. Keep them in sync when the schema evolves.
 * You can also regenerate them with:
 *   npx supabase gen types typescript --project-id <ref> > lib/database.types.ts
 */

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "incomplete";

export type TransactionType = "income" | "withdrawal";

export type PeriodType = "monthly" | "quarterly";

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          email: string;
          created_at: string;
          trial_end: string;
          subscription_status: SubscriptionStatus;
          advanced_mode: boolean;
        };
        Insert: {
          id: string;
          email: string;
          created_at?: string;
          trial_end?: string;
          subscription_status?: SubscriptionStatus;
          advanced_mode?: boolean;
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
          trial_end?: string;
          subscription_status?: SubscriptionStatus;
          advanced_mode?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "profiles_id_fkey";
            columns: ["id"];
            referencedRelation: "users";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          description?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number;
          description?: string | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      transactions: {
        Row: {
          id: string;
          user_id: string;
          type: TransactionType;
          amount: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: TransactionType;
          amount: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: TransactionType;
          amount?: number;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      urssaf_profile: {
        Row: {
          user_id: string;
          activity_type: string;
          urssaf_rate: number;
        };
        Insert: {
          user_id: string;
          activity_type: string;
          urssaf_rate: number;
        };
        Update: {
          user_id?: string;
          activity_type?: string;
          urssaf_rate?: number;
        };
        Relationships: [
          {
            foreignKeyName: "urssaf_profile_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      periods: {
        Row: {
          id: string;
          user_id: string;
          type: PeriodType;
          start_date: string;
          current_ca: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: PeriodType;
          start_date: string;
          current_ca?: number;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: PeriodType;
          start_date?: string;
          current_ca?: number;
        };
        Relationships: [
          {
            foreignKeyName: "periods_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
};

export type Profile = Database["public"]["Tables"]["profiles"]["Row"];
export type Transaction = Database["public"]["Tables"]["transactions"]["Row"];
export type Expense = Database["public"]["Tables"]["expenses"]["Row"];
export type UrssafProfile = Database["public"]["Tables"]["urssaf_profile"]["Row"];
export type Period = Database["public"]["Tables"]["periods"]["Row"];
