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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      applications: {
        Row: {
          age_range: string
          attendance: number | null
          audience: Json
          business_name: string
          city: string
          click_rate: number | null
          community_name: string
          company_id: string
          created_at: string
          email: string
          event_types: Json
          events_count: number | null
          fb_group: number | null
          fb_page: number | null
          first_name: string
          founded: number | null
          id: string
          instagram: number | null
          last_name: string
          logo1_path: string | null
          logo2_path: string | null
          newsletter: number | null
          open_rate: number | null
          partners: Json
          phone: string
          purpose: string
          total_exposure: number | null
          whatsapp: number | null
        }
        Insert: {
          age_range?: string
          attendance?: number | null
          audience?: Json
          business_name?: string
          city?: string
          click_rate?: number | null
          community_name?: string
          company_id?: string
          created_at?: string
          email?: string
          event_types?: Json
          events_count?: number | null
          fb_group?: number | null
          fb_page?: number | null
          first_name?: string
          founded?: number | null
          id?: string
          instagram?: number | null
          last_name?: string
          logo1_path?: string | null
          logo2_path?: string | null
          newsletter?: number | null
          open_rate?: number | null
          partners?: Json
          phone?: string
          purpose?: string
          total_exposure?: number | null
          whatsapp?: number | null
        }
        Update: {
          age_range?: string
          attendance?: number | null
          audience?: Json
          business_name?: string
          city?: string
          click_rate?: number | null
          community_name?: string
          company_id?: string
          created_at?: string
          email?: string
          event_types?: Json
          events_count?: number | null
          fb_group?: number | null
          fb_page?: number | null
          first_name?: string
          founded?: number | null
          id?: string
          instagram?: number | null
          last_name?: string
          logo1_path?: string | null
          logo2_path?: string | null
          newsletter?: number | null
          open_rate?: number | null
          partners?: Json
          phone?: string
          purpose?: string
          total_exposure?: number | null
          whatsapp?: number | null
        }
        Relationships: []
      }
      form_responses: {
        Row: {
          answers: Json
          created_at: string
          files: Json
          form_id: string
          id: string
          labels: Json
          notes: string
          status: string
          updated_at: string | null
        }
        Insert: {
          answers?: Json
          created_at?: string
          files?: Json
          form_id: string
          id?: string
          labels?: Json
          notes?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          answers?: Json
          created_at?: string
          files?: Json
          form_id?: string
          id?: string
          labels?: Json
          notes?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "form_responses_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          accent: string | null
          created_at: string
          draft: Json
          history: Json
          id: string
          is_home: boolean
          preview_token: string | null
          published: Json | null
          published_at: string | null
          slug: string
          status: string
          template: string
          title: string
          updated_at: string
        }
        Insert: {
          accent?: string | null
          created_at?: string
          draft: Json
          history?: Json
          id?: string
          is_home?: boolean
          preview_token?: string | null
          published?: Json | null
          published_at?: string | null
          slug: string
          status?: string
          template?: string
          title?: string
          updated_at?: string
        }
        Update: {
          accent?: string | null
          created_at?: string
          draft?: Json
          history?: Json
          id?: string
          is_home?: boolean
          preview_token?: string | null
          published?: Json | null
          published_at?: string | null
          slug?: string
          status?: string
          template?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      short_links: {
        Row: {
          alias: string
          created_at: string
          id: string
          short_url: string
          target: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          short_url: string
          target: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          short_url?: string
          target?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      form_accepts: { Args: { _form_id: string }; Returns: boolean }
      get_home_form: {
        Args: never
        Returns: {
          accent: string
          accepting: boolean
          def: Json
          id: string
          slug: string
          status: string
          template: string
        }[]
      }
      get_preview_form: {
        Args: { _slug: string; _token: string }
        Returns: {
          accent: string
          accepting: boolean
          def: Json
          id: string
          slug: string
          status: string
          template: string
        }[]
      }
      get_public_form: {
        Args: { _slug: string }
        Returns: {
          accent: string
          accepting: boolean
          def: Json
          id: string
          slug: string
          status: string
          template: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      set_home_form: { Args: { _form_id: string }; Returns: undefined }
    }
    Enums: {
      app_role: "admin" | "user"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "user"],
    },
  },
} as const
