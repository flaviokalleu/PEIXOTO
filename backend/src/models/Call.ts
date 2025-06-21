import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Unique,
  Default,
  BelongsTo,
  ForeignKey,
  DataType
} from "sequelize-typescript";
import Ticket from "./Ticket";
import User from "./User";

@Table
class Call extends Model<Call> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Unique
  @Column
  callId: string;

  @AllowNull(false)
  @Default('pending')
  @Column(DataType.ENUM('pending', 'in-progress', 'completed', 'failed'))
  status: string;

  @ForeignKey(() => Ticket)
  @AllowNull(false)
  @Column
  ticketId: number;

  @ForeignKey(() => User)
  @AllowNull(true)
  @Column
  userId: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @BelongsTo(() => User)
  user: User;
}

export default Call;