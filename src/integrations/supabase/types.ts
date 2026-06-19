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
      ad_rewards: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_client_id: string
          blocker_client_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_client_id: string
          blocker_client_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_client_id?: string
          blocker_client_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      coin_transactions: {
        Row: {
          created_at: string
          delta: number
          id: string
          metadata: Json
          reason: string
          user_id: string
        }
        Insert: {
          created_at?: string
          delta: number
          id?: string
          metadata?: Json
          reason: string
          user_id: string
        }
        Update: {
          created_at?: string
          delta?: number
          id?: string
          metadata?: Json
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      friend_messages: {
        Row: {
          content: string
          created_at: string
          from_client_id: string
          id: string
          pair_key: string
          to_client_id: string
        }
        Insert: {
          content: string
          created_at?: string
          from_client_id: string
          id?: string
          pair_key: string
          to_client_id: string
        }
        Update: {
          content?: string
          created_at?: string
          from_client_id?: string
          id?: string
          pair_key?: string
          to_client_id?: string
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          created_at: string
          from_avatar_url: string
          from_client_id: string
          from_country: string
          from_nickname: string
          id: string
          session_id: string
          to_client_id: string
        }
        Insert: {
          created_at?: string
          from_avatar_url?: string
          from_client_id: string
          from_country?: string
          from_nickname?: string
          id?: string
          session_id: string
          to_client_id: string
        }
        Update: {
          created_at?: string
          from_avatar_url?: string
          from_client_id?: string
          from_country?: string
          from_nickname?: string
          id?: string
          session_id?: string
          to_client_id?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          avatar_a: string
          avatar_b: string
          client_id_a: string
          client_id_b: string
          country_a: string
          country_b: string
          created_at: string
          id: string
          nickname_a: string
          nickname_b: string
        }
        Insert: {
          avatar_a?: string
          avatar_b?: string
          client_id_a: string
          client_id_b: string
          country_a?: string
          country_b?: string
          created_at?: string
          id?: string
          nickname_a?: string
          nickname_b?: string
        }
        Update: {
          avatar_a?: string
          avatar_b?: string
          client_id_a?: string
          client_id_b?: string
          country_a?: string
          country_b?: string
          created_at?: string
          id?: string
          nickname_a?: string
          nickname_b?: string
        }
        Relationships: []
      }
      match_sessions: {
        Row: {
          created_at: string
          decide_deadline: string
          ended_reason: string | null
          id: string
          left_by: string | null
          lobby: string
          status: Database["public"]["Enums"]["session_status"]
          user_a_avatar_url: string
          user_a_client_id: string
          user_a_country: string
          user_a_decision: Database["public"]["Enums"]["decision"]
          user_a_gender: string
          user_a_nickname: string
          user_b_avatar_url: string
          user_b_client_id: string
          user_b_country: string
          user_b_decision: Database["public"]["Enums"]["decision"]
          user_b_gender: string
          user_b_nickname: string
        }
        Insert: {
          created_at?: string
          decide_deadline: string
          ended_reason?: string | null
          id?: string
          left_by?: string | null
          lobby?: string
          status?: Database["public"]["Enums"]["session_status"]
          user_a_avatar_url?: string
          user_a_client_id: string
          user_a_country?: string
          user_a_decision?: Database["public"]["Enums"]["decision"]
          user_a_gender?: string
          user_a_nickname: string
          user_b_avatar_url?: string
          user_b_client_id: string
          user_b_country?: string
          user_b_decision?: Database["public"]["Enums"]["decision"]
          user_b_gender?: string
          user_b_nickname: string
        }
        Update: {
          created_at?: string
          decide_deadline?: string
          ended_reason?: string | null
          id?: string
          left_by?: string | null
          lobby?: string
          status?: Database["public"]["Enums"]["session_status"]
          user_a_avatar_url?: string
          user_a_client_id?: string
          user_a_country?: string
          user_a_decision?: Database["public"]["Enums"]["decision"]
          user_a_gender?: string
          user_a_nickname?: string
          user_b_avatar_url?: string
          user_b_client_id?: string
          user_b_country?: string
          user_b_decision?: Database["public"]["Enums"]["decision"]
          user_b_gender?: string
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
      profiles: {
        Row: {
          age: number | null
          avatar_url: string
          client_id: string
          country: string
          created_at: string
          gender: string
          nickname: string
          updated_at: string
          user_id: string
        }
        Insert: {
          age?: number | null
          avatar_url?: string
          client_id?: string
          country?: string
          created_at?: string
          gender?: string
          nickname?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          age?: number | null
          avatar_url?: string
          client_id?: string
          country?: string
          created_at?: string
          gender?: string
          nickname?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      queue: {
        Row: {
          avatar_url: string
          client_id: string
          country: string
          created_at: string
          gender: string
          id: string
          lobby: string
          nickname: string
        }
        Insert: {
          avatar_url?: string
          client_id: string
          country?: string
          created_at?: string
          gender?: string
          id?: string
          lobby?: string
          nickname: string
        }
        Update: {
          avatar_url?: string
          client_id?: string
          country?: string
          created_at?: string
          gender?: string
          id?: string
          lobby?: string
          nickname?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string
          details: string
          id: string
          reason: string
          reported_client_id: string
          reporter_client_id: string
          session_id: string | null
        }
        Insert: {
          created_at?: string
          details?: string
          id?: string
          reason?: string
          reported_client_id: string
          reporter_client_id: string
          session_id?: string | null
        }
        Update: {
          created_at?: string
          details?: string
          id?: string
          reason?: string
          reported_client_id?: string
          reporter_client_id?: string
          session_id?: string | null
        }
        Relationships: []
      }
      wallets: {
        Row: {
          balance: number
          created_at: string
          updated_at: string
          user_id: string
        }
        Insert: {
          balance?: number
          created_at?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          balance?: number
          created_at?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      credit_coins: {
        Args: {
          _amount: number
          _meta?: Json
          _reason: string
          _user_id: string
        }
        Returns: number
      }
      current_client_id: { Args: never; Returns: string }
      is_session_participant: {
        Args: { _session_id: string }
        Returns: boolean
      }
      spend_coins: {
        Args: {
          _amount: number
          _meta?: Json
          _reason: string
          _user_id: string
        }
        Returns: number
      }
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
