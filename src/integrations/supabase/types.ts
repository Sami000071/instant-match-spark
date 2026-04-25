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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      match_sessions: {
        Row: {
          created_at: string
          decide_deadline: string
          ended_reason: string | null
          id: string
          left_by: string | null
          status: Database["public"]["Enums"]["session_status"]
          user_a_client_id: string
          user_a_country: string
          user_a_decision: Database["public"]["Enums"]["decision"]
          user_a_gender: string
          user_a_interests: string[]
          user_a_nickname: string
          user_b_client_id: string
          user_b_country: string
          user_b_decision: Database["public"]["Enums"]["decision"]
          user_b_gender: string
          user_b_interests: string[]
          user_b_nickname: string
        }
        Insert: {
          created_at?: string
          decide_deadline: string
          ended_reason?: string | null
          id?: string
          left_by?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          user_a_client_id: string
          user_a_country?: string
          user_a_decision?: Database["public"]["Enums"]["decision"]
          user_a_gender?: string
          user_a_interests?: string[]
          user_a_nickname: string
          user_b_client_id: string
          user_b_country?: string
          user_b_decision?: Database["public"]["Enums"]["decision"]
          user_b_gender?: string
          user_b_interests?: string[]
          user_b_nickname: string
        }
        Update: {
          created_at?: string
          decide_deadline?: string
          ended_reason?: string | null
          id?: string
          left_by?: string | null
          status?: Database["public"]["Enums"]["session_status"]
          user_a_client_id?: string
          user_a_country?: string
          user_a_decision?: Database["public"]["Enums"]["decision"]
          user_a_gender?: string
          user_a_interests?: string[]
          user_a_nickname?: string
          user_b_client_id?: string
          user_b_country?: string
          user_b_decision?: Database["public"]["Enums"]["decision"]
          user_b_gender?: string
          user_b_interests?: string[]
          user_b_nickname?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          content: string
          created_at: string
          id: string
          sender_client_id: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          sender_client_id: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          sender_client_id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "match_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      queue: {
        Row: {
          client_id: string
          country: string
          created_at: string
          gender: string
          id: string
          interests: string[]
          nickname: string
        }
        Insert: {
          client_id: string
          country?: string
          created_at?: string
          gender?: string
          id?: string
          interests?: string[]
          nickname: string
        }
        Update: {
          client_id?: string
          country?: string
          created_at?: string
          gender?: string
          id?: string
          interests?: string[]
          nickname?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      decision: "pending" | "accept" | "skip"
      session_status: "deciding" | "chatting" | "ended"
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
      decision: ["pending", "accept", "skip"],
      session_status: ["deciding", "chatting", "ended"],
    },
  },
} as const
