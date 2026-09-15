import { UserDataType } from "../models/User";

export type AuthData = Pick<UserDataType, "_id" | "username" | "publicId" | "plan">