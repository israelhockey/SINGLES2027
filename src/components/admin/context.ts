import { createContext, useContext } from "react";

export const AdminEmailCtx = createContext("");
export const useAdminEmail = () => useContext(AdminEmailCtx);
