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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      achievements: {
        Row: {
          created_at: string
          description: string
          key: string
          kind: string
          line_id: string | null
          name: string
          points: number
          threshold: number | null
        }
        Insert: {
          created_at?: string
          description: string
          key: string
          kind: string
          line_id?: string | null
          name: string
          points?: number
          threshold?: number | null
        }
        Update: {
          created_at?: string
          description?: string
          key?: string
          kind?: string
          line_id?: string | null
          name?: string
          points?: number
          threshold?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "achievements_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "achievements_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "my_line_progress"
            referencedColumns: ["line_id"]
          },
        ]
      }
      challenges: {
        Row: {
          city_id: string
          description: string
          ends_at: string
          id: string
          kind: string
          line_id: string | null
          points: number
          starts_at: string
          station_ids: string[] | null
          target: number
          title: string
        }
        Insert: {
          city_id: string
          description: string
          ends_at: string
          id?: string
          kind: string
          line_id?: string | null
          points?: number
          starts_at: string
          station_ids?: string[] | null
          target: number
          title: string
        }
        Update: {
          city_id?: string
          description?: string
          ends_at?: string
          id?: string
          kind?: string
          line_id?: string | null
          points?: number
          starts_at?: string
          station_ids?: string[] | null
          target?: number
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "challenges_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "challenges_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
        ]
      }
      cities: {
        Row: {
          centre_lat: number
          centre_lon: number
          country_code: string
          created_at: string
          id: string
          name: string
          slug: string
        }
        Insert: {
          centre_lat: number
          centre_lon: number
          country_code: string
          created_at?: string
          id?: string
          name: string
          slug: string
        }
        Update: {
          centre_lat?: number
          centre_lon?: number
          country_code?: string
          created_at?: string
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_followee_id_fkey"
            columns: ["followee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      line_stations: {
        Row: {
          branch: number
          line_id: string
          sequence: number
          station_id: string
        }
        Insert: {
          branch?: number
          line_id: string
          sequence: number
          station_id: string
        }
        Update: {
          branch?: number
          line_id?: string
          sequence?: number
          station_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "line_stations_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "lines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "line_stations_line_id_fkey"
            columns: ["line_id"]
            isOneToOne: false
            referencedRelation: "my_line_progress"
            referencedColumns: ["line_id"]
          },
          {
            foreignKeyName: "line_stations_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
        ]
      }
      lines: {
        Row: {
          city_id: string
          colour: string | null
          created_at: string
          external_id: string
          external_source: string
          geometry: Json | null
          id: string
          mode: string
          name: string
          network: string
        }
        Insert: {
          city_id: string
          colour?: string | null
          created_at?: string
          external_id: string
          external_source: string
          geometry?: Json | null
          id?: string
          mode: string
          name: string
          network?: string
        }
        Update: {
          city_id?: string
          colour?: string | null
          created_at?: string
          external_id?: string
          external_source?: string
          geometry?: Json | null
          id?: string
          mode?: string
          name?: string
          network?: string
        }
        Relationships: [
          {
            foreignKeyName: "lines_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          home_city_id: string | null
          id: string
          shadow_banned: boolean
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          home_city_id?: string | null
          id: string
          shadow_banned?: boolean
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          home_city_id?: string | null
          id?: string
          shadow_banned?: boolean
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_home_city_id_fkey"
            columns: ["home_city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      share_events: {
        Row: {
          achievement_key: string | null
          channel: string | null
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          achievement_key?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          achievement_key?: string | null
          channel?: string | null
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_events_achievement_key_fkey"
            columns: ["achievement_key"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "share_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stations: {
        Row: {
          city_id: string
          created_at: string
          external_id: string
          external_source: string
          geog: unknown
          hub_id: string | null
          id: string
          lat: number
          lon: number
          modes: string[]
          name: string
          network: string
        }
        Insert: {
          city_id: string
          created_at?: string
          external_id: string
          external_source: string
          geog?: unknown
          hub_id?: string | null
          id?: string
          lat: number
          lon: number
          modes?: string[]
          name: string
          network?: string
        }
        Update: {
          city_id?: string
          created_at?: string
          external_id?: string
          external_source?: string
          geog?: unknown
          hub_id?: string | null
          id?: string
          lat?: number
          lon?: number
          modes?: string[]
          name?: string
          network?: string
        }
        Relationships: [
          {
            foreignKeyName: "stations_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_key: string
          earned_at: string
          id: string
          station_id: string | null
          user_id: string
          visit_id: string | null
        }
        Insert: {
          achievement_key: string
          earned_at?: string
          id?: string
          station_id?: string | null
          user_id: string
          visit_id?: string | null
        }
        Update: {
          achievement_key?: string
          earned_at?: string
          id?: string
          station_id?: string | null
          user_id?: string
          visit_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_key_fkey"
            columns: ["achievement_key"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "user_achievements_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_achievements_visit_id_fkey"
            columns: ["visit_id"]
            isOneToOne: false
            referencedRelation: "visits"
            referencedColumns: ["id"]
          },
        ]
      }
      visits: {
        Row: {
          accuracy_m: number
          distance_m: number
          flags: string[]
          id: string
          lat: number
          lon: number
          source: string
          station_id: string
          user_id: string
          visited_at: string
        }
        Insert: {
          accuracy_m: number
          distance_m: number
          flags?: string[]
          id?: string
          lat: number
          lon: number
          source?: string
          station_id: string
          user_id: string
          visited_at?: string
        }
        Update: {
          accuracy_m?: number
          distance_m?: number
          flags?: string[]
          id?: string
          lat?: number
          lon?: number
          source?: string
          station_id?: string
          user_id?: string
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visits_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      my_line_progress: {
        Row: {
          city_id: string | null
          colour: string | null
          line_id: string | null
          mode: string | null
          name: string | null
          network: string | null
          total_stations: number | null
          visited_stations: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lines_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      station_visit_counts: {
        Row: {
          first_visited_at: string | null
          last_visited_at: string | null
          station_id: string | null
          user_id: string | null
          visits: number | null
        }
        Relationships: [
          {
            foreignKeyName: "visits_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "visits_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      check_in: {
        Args: {
          p_accuracy_m: number
          p_lat: number
          p_lon: number
          p_mocked?: boolean
          p_station_id: string
        }
        Returns: Json
      }
      check_in_settings: {
        Args: never
        Returns: {
          base_radius_m: number
          max_accuracy_bonus_m: number
          max_accuracy_m: number
          max_speed_kmh: number
          min_gap_seconds: number
          rate_limit: string
        }[]
      }
      evaluate_achievements: {
        Args: { p_station_id: string; p_user_id: string; p_visit_id: string }
        Returns: string[]
      }
      leaderboard: {
        Args: { p_city_id: string; p_limit?: number; p_period?: string; p_scope?: string }
        Returns: {
          avatar_url: string
          display_name: string
          is_me: boolean
          rank: number
          score: number
          user_id: string
          username: string
        }[]
      }
      level_for_xp: {
        Args: { p_xp: number }
        Returns: number
      }
      my_challenges: {
        Args: { p_city_id: string }
        Returns: {
          completed: boolean
          description: string
          ends_at: string
          id: string
          kind: string
          line_id: string
          points: number
          progress: number
          starts_at: string
          target: number
          title: string
        }[]
      }
      my_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          current_streak: number
          level: number
          longest_streak: number
          stations: number
          visits: number
          xp: number
          xp_for_next: number
          xp_into_level: number
        }[]
      }
      search_profiles: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          avatar_url: string
          display_name: string
          follows_me: boolean
          id: string
          is_following: boolean
          username: string
        }[]
      }
      nearest_stations: {
        Args: { p_lat: number; p_limit?: number; p_lon: number }
        Returns: {
          distance_m: number
          id: string
          lat: number
          lon: number
          name: string
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
