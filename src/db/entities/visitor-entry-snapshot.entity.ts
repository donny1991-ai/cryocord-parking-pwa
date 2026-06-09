import { EntitySchema } from "typeorm";
import type { VisitorEntity } from "./visitor.entity";

export interface VisitorEntrySnapshotEntity {
  id: string;
  visitorId: string;
  visitor?: VisitorEntity;
  bucket: string;
  path: string;
  contentType: string;
  capturedAt: Date;
  capturedBy: string | null;
  createdAt: Date;
}

export const VisitorEntrySnapshotSchema = new EntitySchema<VisitorEntrySnapshotEntity>({
  name: "VisitorEntrySnapshot",
  tableName: "visitor_entry_snapshots",
  schema: "parking",
  columns: {
    id: {
      type: "uuid",
      primary: true,
      generated: "uuid",
    },
    visitorId: {
      name: "visitor_id",
      type: "uuid",
    },
    bucket: {
      type: String,
      length: 120,
    },
    path: {
      type: "text",
    },
    contentType: {
      name: "content_type",
      type: String,
      length: 80,
    },
    capturedAt: {
      name: "captured_at",
      type: "timestamptz",
      createDate: true,
    },
    capturedBy: {
      name: "captured_by",
      type: "uuid",
      nullable: true,
    },
    createdAt: {
      name: "created_at",
      type: "timestamptz",
      createDate: true,
    },
  },
  relations: {
    visitor: {
      type: "many-to-one",
      target: "Visitor",
      joinColumn: {
        name: "visitor_id",
        referencedColumnName: "id",
      },
      onDelete: "CASCADE",
    },
  },
});
