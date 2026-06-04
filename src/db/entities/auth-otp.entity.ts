import { EntitySchema } from "typeorm";

export interface AuthOtpEntity {
  id: string;
  userId: string;
  email: string;
  otpHash: string;
  attempts: number;
  expiresAt: Date;
  consumedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const AuthOtpSchema = new EntitySchema<AuthOtpEntity>({
  name: "AuthOtp",
  tableName: "auth_otps",
  schema: "parking",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    userId: {
      name: "user_id",
      type: "uuid",
    },
    email: {
      type: String,
      length: 320,
    },
    otpHash: {
      name: "otp_hash",
      type: String,
      length: 64,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    expiresAt: {
      name: "expires_at",
      type: "timestamptz",
    },
    consumedAt: {
      name: "consumed_at",
      type: "timestamptz",
      nullable: true,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
    updatedAt: {
      name: "updated_at",
      type: "timestamptz",
      updateDate: true,
    },
  },
  indices: [
    {
      name: "idx_auth_otps_email_created_at",
      columns: ["email", "createdAt"],
    },
    {
      name: "idx_auth_otps_user_created_at",
      columns: ["userId", "createdAt"],
    },
  ],
});
