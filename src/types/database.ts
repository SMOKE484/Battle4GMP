// These row types are `type` aliases, not `interface`s, deliberately: the typed
// Supabase client checks `Database['public'] extends GenericSchema` internally,
// and TypeScript's structural check for assignability to an index-signature type
// (Record<string, unknown>) only treats object *type literals* as satisfying it —
// interfaces don't, even when structurally identical. Using `interface` here
// silently breaks all typed `.from(...)` calls (they degrade to `never`).
export type PlayerRow = {
  id: string;
  device_id: string;
  auth_user_id: string | null;
  display_name: string;
  created_at: string;
};

export type ScoreRow = {
  id: string;
  player_id: string;
  level_1_score: number;
  level_2_score: number;
  level_3_score: number;
  total_score: number;
  tokens_used: number;
  completed_at: string;
  challenge_id: string | null;
};

export type QuestionTopic = 'data_integrity' | 'personnel' | 'sterility';
export type QuestionSource = 'deepseek' | 'fallback';

export type CachedQuestionRow = {
  id: string;
  level: 1 | 2 | 3;
  topic: QuestionTopic;
  question_set: unknown;
  source: QuestionSource;
  generated_at: string;
};

export type LeaderboardRow = {
  player_id: string;
  display_name: string;
  total_score: number;
  level_1_score: number;
  level_2_score: number;
  level_3_score: number;
  completed_at: string;
};

export type ChallengeRow = {
  id: string;
  code: string;
  host_player_id: string;
  level: 1 | 2 | 3;
  expires_at: string;
  created_at: string;
};

export type ChallengeParticipantRow = {
  id: string;
  challenge_id: string;
  player_id: string;
  joined_at: string;
};

export type ChallengeLeaderboardRow = {
  challenge_id: string;
  player_id: string;
  display_name: string;
  total_score: number;
  tokens_used: number;
  completed_at: string;
};

export type RoomPhase = 'lobby' | 'question' | 'reveal' | 'leaderboard' | 'ended';

// 'mixed' is only ever valid for challenge_rooms (Rapid Round) — QuestionTopic
// itself stays the 3 real topics, since that's what cached_questions and the
// solo-level generators use, and 'mixed' has no meaning there.
export type RoomTopic = QuestionTopic | 'mixed';

export type ChallengeRoomRow = {
  id: string;
  code: string;
  host_player_id: string;
  topic: RoomTopic;
  question_set: unknown;
  phase: RoomPhase;
  current_question_index: number;
  phase_started_at: string;
  question_duration_ms: number;
  created_at: string;
};

export type ChallengeRoomPlayerRow = {
  id: string;
  room_id: string;
  player_id: string;
  display_name_snapshot: string;
  joined_at: string;
};

export type ChallengeRoomAnswerRow = {
  id: string;
  room_id: string;
  player_id: string;
  question_index: number;
  selected_option: 0 | 1 | 2 | 3;
  is_correct: boolean;
  answer_ms: number;
  points: number;
  answered_at: string;
};

export type ChallengeRoomLeaderboardRow = {
  room_id: string;
  player_id: string;
  display_name: string;
  total_points: number;
  correct_count: number;
  last_answered_at: string;
};

export type InviteStatus = 'pending' | 'accepted' | 'declined';

export type RoomInviteRow = {
  id: string;
  room_id: string;
  room_code: string;
  inviter_player_id: string;
  inviter_display_name: string;
  invitee_player_id: string;
  status: InviteStatus;
  created_at: string;
};

export type Database = {
  public: {
    Tables: {
      players: {
        Row: PlayerRow;
        Insert: Partial<PlayerRow> & { device_id: string };
        Update: Partial<PlayerRow>;
        Relationships: [];
      };
      scores: {
        Row: ScoreRow;
        // total_score is a Postgres GENERATED ALWAYS AS (...) STORED column — Postgres
        // rejects an INSERT that supplies it, so the Insert type must not permit it either.
        Insert: Omit<Partial<ScoreRow>, 'total_score'> & { player_id: string };
        Update: Partial<ScoreRow>;
        Relationships: [];
      };
      cached_questions: {
        Row: CachedQuestionRow;
        Insert: Partial<CachedQuestionRow> & {
          level: 1 | 2 | 3;
          topic: QuestionTopic;
          question_set: unknown;
        };
        Update: Partial<CachedQuestionRow>;
        Relationships: [];
      };
      challenges: {
        Row: ChallengeRow;
        Insert: Partial<ChallengeRow> & { code: string; host_player_id: string; level: 1 | 2 | 3; expires_at: string };
        Update: Partial<ChallengeRow>;
        Relationships: [];
      };
      challenge_participants: {
        Row: ChallengeParticipantRow;
        Insert: Partial<ChallengeParticipantRow> & { challenge_id: string; player_id: string };
        Update: Partial<ChallengeParticipantRow>;
        Relationships: [];
      };
      challenge_rooms: {
        Row: ChallengeRoomRow;
        Insert: Partial<ChallengeRoomRow> & {
          code: string;
          host_player_id: string;
          topic: RoomTopic;
          question_set: unknown;
        };
        Update: Partial<ChallengeRoomRow>;
        Relationships: [];
      };
      challenge_room_players: {
        Row: ChallengeRoomPlayerRow;
        Insert: Partial<ChallengeRoomPlayerRow> & { room_id: string; player_id: string; display_name_snapshot: string };
        Update: Partial<ChallengeRoomPlayerRow>;
        Relationships: [];
      };
      challenge_room_answers: {
        Row: ChallengeRoomAnswerRow;
        Insert: Partial<ChallengeRoomAnswerRow> & {
          room_id: string;
          player_id: string;
          question_index: number;
          selected_option: 0 | 1 | 2 | 3;
          is_correct: boolean;
          answer_ms: number;
          points: number;
        };
        Update: Partial<ChallengeRoomAnswerRow>;
        Relationships: [];
      };
      room_invites: {
        Row: RoomInviteRow;
        Insert: Partial<RoomInviteRow> & {
          room_id: string;
          room_code: string;
          inviter_player_id: string;
          inviter_display_name: string;
          invitee_player_id: string;
        };
        Update: Partial<RoomInviteRow>;
        Relationships: [];
      };
    };
    Views: {
      leaderboard: {
        Row: LeaderboardRow;
        Relationships: [];
      };
      challenge_leaderboard: {
        Row: ChallengeLeaderboardRow;
        Relationships: [];
      };
      challenge_room_leaderboard: {
        Row: ChallengeRoomLeaderboardRow;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
  };
};
