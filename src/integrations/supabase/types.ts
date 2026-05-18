export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      book_listings: {
        Row: {
          condition: string
          course_code: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          price_sek: number
          seller_user_id: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          condition?: string
          course_code: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          price_sek: number
          seller_user_id: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          condition?: string
          course_code?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          price_sek?: number
          seller_user_id?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      book_orders: {
        Row: {
          buyer_confirmed_delivery_at: string | null
          buyer_user_id: string
          created_at: string
          gross_amount_sek: number
          id: string
          listing_id: string
          order_status: string
          payment_status: string
          platform_fee_sek: number
          seller_net_sek: number
          seller_user_id: string
          swish_reference: string | null
          updated_at: string
        }
        Insert: {
          buyer_confirmed_delivery_at?: string | null
          buyer_user_id: string
          created_at?: string
          gross_amount_sek: number
          id?: string
          listing_id: string
          order_status?: string
          payment_status?: string
          platform_fee_sek: number
          seller_net_sek: number
          seller_user_id: string
          swish_reference?: string | null
          updated_at?: string
        }
        Update: {
          buyer_confirmed_delivery_at?: string | null
          buyer_user_id?: string
          created_at?: string
          gross_amount_sek?: number
          id?: string
          listing_id?: string
          order_status?: string
          payment_status?: string
          platform_fee_sek?: number
          seller_net_sek?: number
          seller_user_id?: string
          swish_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "book_orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "book_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "book_orders_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "public_book_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      course_chat_messages: {
        Row: {
          body: string
          course_code: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          body: string
          course_code: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          body?: string
          course_code?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      course_prerequisites: {
        Row: {
          created_at: string
          id: string
          logic_group: number | null
          original_text: string | null
          required_course_id: string | null
          required_hp: number | null
          required_subject_area: string | null
          requirement_type: Database["public"]["Enums"]["course_requirement_type"]
          target_course_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          logic_group?: number | null
          original_text?: string | null
          required_course_id?: string | null
          required_hp?: number | null
          required_subject_area?: string | null
          requirement_type: Database["public"]["Enums"]["course_requirement_type"]
          target_course_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          logic_group?: number | null
          original_text?: string | null
          required_course_id?: string | null
          required_hp?: number | null
          required_subject_area?: string | null
          requirement_type?: Database["public"]["Enums"]["course_requirement_type"]
          target_course_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_prerequisites_required_course_id_fkey"
            columns: ["required_course_id"]
            isOneToOne: false
            referencedRelation: "courses_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_prerequisites_target_course_id_fkey"
            columns: ["target_course_id"]
            isOneToOne: false
            referencedRelation: "courses_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      course_subtasks: {
        Row: {
          completed: boolean
          course_id: string
          created_at: string
          due_date: string | null
          event_id: string | null
          hp: number | null
          id: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          completed?: boolean
          course_id: string
          created_at?: string
          due_date?: string | null
          event_id?: string | null
          hp?: number | null
          id?: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          completed?: boolean
          course_id?: string
          created_at?: string
          due_date?: string | null
          event_id?: string | null
          hp?: number | null
          id?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_subtasks_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "user_courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_subtasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "study_events"
            referencedColumns: ["id"]
          },
        ]
      }
      courses_catalog: {
        Row: {
          active: boolean
          course_code: string
          course_name: string
          created_at: string
          hp: number
          id: string
          level: string | null
          original_prerequisite_text: string | null
          subject_area: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          course_code: string
          course_name: string
          created_at?: string
          hp?: number
          id?: string
          level?: string | null
          original_prerequisite_text?: string | null
          subject_area?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          course_code?: string
          course_name?: string
          created_at?: string
          hp?: number
          id?: string
          level?: string | null
          original_prerequisite_text?: string | null
          subject_area?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      dm_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          sender_id: string
          thread_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          sender_id: string
          thread_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          sender_id?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "dm_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_threads: {
        Row: {
          created_at: string
          id: string
          user_a: string
          user_b: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_a: string
          user_b: string
        }
        Update: {
          created_at?: string
          id?: string
          user_a?: string
          user_b?: string
        }
        Relationships: []
      }
      order_messages: {
        Row: {
          body: string
          created_at: string
          id: string
          order_id: string
          sender_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          order_id: string
          sender_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          order_id?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_messages_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "book_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          is_visible: boolean
          program_name: string | null
          setup_complete: boolean | null
          start_year: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_visible?: boolean
          program_name?: string | null
          setup_complete?: boolean | null
          start_year?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          is_visible?: boolean
          program_name?: string | null
          setup_complete?: boolean | null
          start_year?: number | null
          user_id?: string
        }
        Relationships: []
      }
      program_courses: {
        Row: {
          course_id: string
          created_at: string
          id: string
          mandatory: boolean
          period: string | null
          program_id: string
          semester: string | null
          sort_order: number
          updated_at: string
          year: number
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          mandatory?: boolean
          period?: string | null
          program_id: string
          semester?: string | null
          sort_order?: number
          updated_at?: string
          year: number
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          mandatory?: boolean
          period?: string | null
          program_id?: string
          semester?: string | null
          sort_order?: number
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "program_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses_catalog"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "program_courses_program_id_fkey"
            columns: ["program_id"]
            isOneToOne: false
            referencedRelation: "programs_catalog"
            referencedColumns: ["id"]
          },
        ]
      }
      programs_catalog: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          total_hp: number | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          total_hp?: number | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          total_hp?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      study_events: {
        Row: {
          course_code: string | null
          created_at: string
          description: string | null
          due_date: string
          due_time: string | null
          event_type: string
          hp: number | null
          id: string
          status: string
          title: string
          user_id: string
        }
        Insert: {
          course_code?: string | null
          created_at?: string
          description?: string | null
          due_date: string
          due_time?: string | null
          event_type?: string
          hp?: number | null
          id?: string
          status?: string
          title: string
          user_id: string
        }
        Update: {
          course_code?: string | null
          created_at?: string
          description?: string | null
          due_date?: string
          due_time?: string | null
          event_type?: string
          hp?: number | null
          id?: string
          status?: string
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      user_courses: {
        Row: {
          course_code: string
          course_name: string
          created_at: string
          hp: number
          id: string
          status: string
          updated_at: string
          user_id: string
          year: number
        }
        Insert: {
          course_code: string
          course_name: string
          created_at?: string
          hp?: number
          id?: string
          status?: string
          updated_at?: string
          user_id: string
          year: number
        }
        Update: {
          course_code?: string
          course_name?: string
          created_at?: string
          hp?: number
          id?: string
          status?: string
          updated_at?: string
          user_id?: string
          year?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      public_book_listings: {
        Row: {
          condition: string | null
          course_code: string | null
          created_at: string | null
          description: string | null
          id: string | null
          image_url: string | null
          price_sek: number | null
          status: string | null
          title: string | null
        }
        Insert: {
          condition?: string | null
          course_code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          price_sek?: number | null
          status?: string | null
          title?: string | null
        }
        Update: {
          condition?: string | null
          course_code?: string | null
          created_at?: string | null
          description?: string | null
          id?: string | null
          image_url?: string | null
          price_sek?: number | null
          status?: string | null
          title?: string | null
        }
        Relationships: []
      }
      visible_profiles: {
        Row: {
          display_name: string | null
          program_name: string | null
          user_id: string | null
        }
        Insert: {
          display_name?: string | null
          program_name?: string | null
          user_id?: string | null
        }
        Update: {
          display_name?: string | null
          program_name?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      grant_admin_by_email: { Args: { _email: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_user_visible: { Args: { _uid: string }; Returns: boolean }
      list_admins: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          email: string
          user_id: string
        }[]
      }
      order_is_unlocked: {
        Args: { _order_id: string; _uid: string }
        Returns: boolean
      }
      revoke_admin: { Args: { _user_id: string }; Returns: undefined }
      user_has_course: {
        Args: { _code: string; _uid: string }
        Returns: boolean
      }
      users_share_course: { Args: { _a: string; _b: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin"
      course_requirement_type:
        | "completed_course"
        | "attended_course"
        | "completed_hp_in_course"
        | "completed_hp_in_subject"
        | "completed_total_hp"
        | "custom_text"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin"],
      course_requirement_type: [
        "completed_course",
        "attended_course",
        "completed_hp_in_course",
        "completed_hp_in_subject",
        "completed_total_hp",
        "custom_text",
      ],
    },
  },
} as const
