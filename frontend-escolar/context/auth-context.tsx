"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";
import { apiUrl } from "@/lib/api";

export type UserRole =
  | "SUPERUSUARIO"
  | "ADMIN_ESCOLA"
  | "FINANCEIRO"
  | "GESTOR"
  | "COORDENADOR"
  | "SECRETARIA"
  | "AUXILIAR"
  | "PROFESSOR"
  | "RESPONSAVEL"
  | "ALUNO";

type User = {
  id: string;
  name: string;
  email: string;
  username?: string | null;
  cpf?: string | null;
  role: UserRole;
  fotoUrl?: string | null;
  schoolId?: string | null;
  plan?: string | null;
  isSuperuserMaintenance?: boolean;
  originalRole?: UserRole | null;
  maintenanceSchoolName?: string | null;
};

type SelectedSchool = {
  id: string;
  name: string;
  status?: string | null;
  logoUrl?: string | null;
};

type LoginResponse = {
  access_token: string;
  user: User;
};

type AuthContextType = {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  selectedSchool: SelectedSchool | null;
  login: (identifier: string, password: string) => Promise<LoginResponse>;
  logout: () => void;
  setSelectedSchool: (school: SelectedSchool | null) => void;
  clearSelectedSchool: () => void;
  switchSchool: (school: SelectedSchool) => Promise<void>;
  enterSchoolAsAdmin: (school: SelectedSchool) => Promise<void>;
  exitSchoolMaintenance: () => void;
};

const AuthContext = createContext<AuthContextType | null>(null);

const AUTH_USER_KEY = "gestclass_user";
const AUTH_TOKEN_KEY = "gestclass_token";
const SELECTED_SCHOOL_KEY = "gestclass_selected_school";
const SUPERUSER_SESSION_KEY = "gestclass_superuser_original_session";

type StoredSession = {
  user: User;
  token: string;
  selectedSchool: SelectedSchool | null;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [selectedSchool, setSelectedSchoolState] =
    useState<SelectedSchool | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  function persistAuth(data: LoginResponse) {
    setUser(data.user);
    setToken(data.access_token);

    sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(data.user));
    sessionStorage.setItem(AUTH_TOKEN_KEY, data.access_token);
  }

  function setSelectedSchool(school: SelectedSchool | null) {
    setSelectedSchoolState(school);

    if (school) {
      sessionStorage.setItem(SELECTED_SCHOOL_KEY, JSON.stringify(school));
    } else {
      sessionStorage.removeItem(SELECTED_SCHOOL_KEY);
    }
  }

  function clearSelectedSchool() {
    setSelectedSchoolState(null);
    sessionStorage.removeItem(SELECTED_SCHOOL_KEY);
  }

  async function switchSchool(school: SelectedSchool) {
    if (!token) {
      throw new Error("Sessão não encontrada.");
    }

    const response = await fetch(apiUrl("/auth/switch-school"), {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        schoolId: school.id,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Erro ao trocar a escola ativa.");
    }

    persistAuth(data);
    setSelectedSchool(school);
  }

  async function enterSchoolAsAdmin(school: SelectedSchool) {
    if (!token || !user) {
      throw new Error("Sessão não encontrada.");
    }

    if (user.role !== "SUPERUSUARIO") {
      throw new Error("Apenas o superusuário pode acessar este modo.");
    }

    const originalSession: StoredSession = {
      user,
      token,
      selectedSchool,
    };

    const response = await fetch(apiUrl("/auth/superuser/enter-school"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        schoolId: school.id,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Erro ao acessar a escola.");
    }

    sessionStorage.setItem(
      SUPERUSER_SESSION_KEY,
      JSON.stringify(originalSession)
    );
    persistAuth(data);
    setSelectedSchool({
      ...school,
      name: school.name || data.user?.maintenanceSchoolName || "",
    });
  }

  function exitSchoolMaintenance() {
    const storedOriginalSession = sessionStorage.getItem(SUPERUSER_SESSION_KEY);

    if (!storedOriginalSession) {
      clearSelectedSchool();
      return;
    }

    try {
      const originalSession = JSON.parse(storedOriginalSession) as StoredSession;

      setUser(originalSession.user);
      setToken(originalSession.token);
      setSelectedSchoolState(originalSession.selectedSchool);

      sessionStorage.setItem(AUTH_USER_KEY, JSON.stringify(originalSession.user));
      sessionStorage.setItem(AUTH_TOKEN_KEY, originalSession.token);

      if (originalSession.selectedSchool) {
        sessionStorage.setItem(
          SELECTED_SCHOOL_KEY,
          JSON.stringify(originalSession.selectedSchool)
        );
      } else {
        sessionStorage.removeItem(SELECTED_SCHOOL_KEY);
      }
    } catch {
      clearSelectedSchool();
    } finally {
      sessionStorage.removeItem(SUPERUSER_SESSION_KEY);
    }
  }

  useEffect(() => {
    try {
      const savedUser = sessionStorage.getItem(AUTH_USER_KEY);
      const savedToken = sessionStorage.getItem(AUTH_TOKEN_KEY);
      const savedSelectedSchool = sessionStorage.getItem(SELECTED_SCHOOL_KEY);

      if (savedUser && savedToken) {
        setUser(JSON.parse(savedUser));
        setToken(savedToken);
      }

      if (savedSelectedSchool) {
        setSelectedSchoolState(JSON.parse(savedSelectedSchool));
      }
    } catch (error) {
      console.error("Erro ao restaurar sessão:", error);
      sessionStorage.removeItem(AUTH_USER_KEY);
      sessionStorage.removeItem(AUTH_TOKEN_KEY);
      sessionStorage.removeItem(SELECTED_SCHOOL_KEY);
    } finally {
      setIsLoading(false);
    }
  }, []);

  async function login(identifier: string, password: string): Promise<LoginResponse> {
    const response = await fetch(apiUrl("/auth/login"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ identifier, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Erro ao fazer login");
    }

    persistAuth(data);
    sessionStorage.removeItem(SUPERUSER_SESSION_KEY);

    if (data.user.role !== "SUPERUSUARIO" && data.user.role !== "ADMIN_ESCOLA") {
      clearSelectedSchool();
    }

    if (data.user.role === "ADMIN_ESCOLA" && data.user.schoolId) {
      setSelectedSchool({
        id: data.user.schoolId,
        name: "",
      });
    }

    return data;
  }

  function logout() {
    setUser(null);
    setToken(null);
    setSelectedSchoolState(null);
    sessionStorage.removeItem(AUTH_USER_KEY);
    sessionStorage.removeItem(AUTH_TOKEN_KEY);
    sessionStorage.removeItem(SELECTED_SCHOOL_KEY);
    sessionStorage.removeItem(SUPERUSER_SESSION_KEY);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        selectedSchool,
        login,
        logout,
        setSelectedSchool,
        clearSelectedSchool,
        switchSchool,
        enterSchoolAsAdmin,
        exitSchoolMaintenance,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth fora do AuthProvider");
  }

  return context;
}


