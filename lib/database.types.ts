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
          paddle_customer_id: string | null;
        };
        Insert: {
          id: string;
          email: string;
          created_at?: string;
          trial_end?: string;
          subscription_status?: SubscriptionStatus;
          advanced_mode?: boolean;
          paddle_customer_id?: string | null;
        };
        Update: {
          id?: string;
          email?: string;
          created_at?: string;
          trial_end?: string;
          subscription_status?: SubscriptionStatus;
          advanced_mode?: boolean;
          paddle_customer_id?: string | null;
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
          /**
           * Decimal VAT rate (e.g. 0.2000 for 20 %). `null` means the user
           * did not flag this expense as recoverable VAT — `amount` is then
           * a plain HT spend with no VAT split.
           */
          vat_rate: number | null;
          /**
           * Foreign key to the recurring template that produced this row,
           * if any. `null` means this is a one-off (manually entered)
           * expense; non-null means it was materialized by the
           * `recurring_expenses` triggers.
           */
          recurring_expense_id: string | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          description?: string | null;
          created_at?: string;
          vat_rate?: number | null;
          recurring_expense_id?: string | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number;
          description?: string | null;
          created_at?: string;
          vat_rate?: number | null;
          recurring_expense_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_user_id_fkey";
            columns: ["user_id"];
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_recurring_expense_id_fkey";
            columns: ["recurring_expense_id"];
            referencedRelation: "recurring_expenses";
            referencedColumns: ["id"];
          },
        ];
      };
      recurring_expenses: {
        Row: {
          id: string;
          user_id: string;
          /** Monthly amount. Trigger multiplies by 3 on quarterly periods. */
          amount: number;
          description: string | null;
          /** Same semantics as `expenses.vat_rate`. */
          vat_rate: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          description?: string | null;
          vat_rate?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number;
          description?: string | null;
          vat_rate?: number | null;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "recurring_expenses_user_id_fkey";
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
          /**
           * Decimal VAT rate applied on income rows (e.g. 0.2000 for 20 %).
           * `null` means the user did not invoice VAT — `amount` is then
           * plain net revenue (HT === TTC). Always `null` for withdrawals;
           * the engine ignores the column on that branch.
           */
          vat_rate: number | null;
        };
        Insert: {
          id?: string;
          user_id: string;
          type: TransactionType;
          amount: number;
          created_at?: string;
          vat_rate?: number | null;
        };
        Update: {
          id?: string;
          user_id?: string;
          type?: TransactionType;
          amount?: number;
          created_at?: string;
          vat_rate?: number | null;
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
          declaration_frequency: PeriodType;
        };
        Insert: {
          user_id: string;
          activity_type: string;
          urssaf_rate: number;
          declaration_frequency?: PeriodType;
        };
        Update: {
          user_id?: string;
          activity_type?: string;
          urssaf_rate?: number;
          declaration_frequency?: PeriodType;
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
export type RecurringExpense =
  Database["public"]["Tables"]["recurring_expenses"]["Row"];
export type UrssafProfile = Database["public"]["Tables"]["urssaf_profile"]["Row"];
export type Period = Database["public"]["Tables"]["periods"]["Row"];
