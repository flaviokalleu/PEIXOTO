import React, { useState, useEffect, useContext } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, LogIn, UserPlus, HelpCircle } from "lucide-react";
import { Helmet } from "react-helmet";
import { AuthContext } from "../../context/Auth/AuthContext";

export default function Login() {
  const { handleLogin } = useContext(AuthContext);
  const [user, setUser] = useState({ email: "", password: "", remember: false });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [userCreationEnabled, setUserCreationEnabled] = useState(true);

  // Determinar a URL do backend
  const backendUrl =
    process.env.REACT_APP_BACKEND_URL === "https://localhost:8090"
      ? "https://localhost:8090"
      : process.env.REACT_APP_BACKEND_URL;

  // Verificar status de userCreation ao carregar o componente
  useEffect(() => {
    const fetchUserCreationStatus = async () => {
      try {
        const response = await fetch(`${backendUrl}/settings/userCreation`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error("Failed to fetch user creation status");
        }

        const data = await response.json();
        setUserCreationEnabled(data.userCreation === "enabled");
      } catch (err) {
        console.error("Erro ao verificar userCreation:", err);
        setUserCreationEnabled(false); // Esconder botão em caso de erro
      }
    };

    fetchUserCreationStatus();
  }, [backendUrl]);

  const handleSubmit = (e) => {
    e.preventDefault();
    handleLogin(user);
  };

  return (
    <>
      <Helmet>
        <title>Login</title>
      </Helmet>
      
      <div className="flex h-screen w-full bg-gray-50">
        <div className="m-auto w-full max-w-md p-8 bg-white rounded-lg shadow-md">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-gray-800">Bem-vindo</h1>
            <p className="text-gray-600 mt-2">Entre com suas credenciais</p>
          </div>
          
          {error && <div className="text-red-500 text-sm mb-4">{error}</div>}
          
          <div className="space-y-6">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-500">
                <Mail size={20} />
              </div>
              <input
                type="email"
                placeholder="Email"
                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={user.email}
                onChange={(e) => setUser({ ...user, email: e.target.value })}
              />
            </div>
            
            <div className="relative">
              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-500">
                <Lock size={20} />
              </div>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Senha"
                className="w-full pl-10 pr-12 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                value={user.password}
                onChange={(e) => setUser({ ...user, password: e.target.value })}
              />
              <div
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-500 hover:text-gray-700 cursor-pointer"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
              </div>
            </div>
            
            <div className="flex items-center">
              <input
                type="checkbox"
                id="remember"
                className="w-4 h-4 text-teal-600 rounded focus:ring-teal-500"
                checked={user.remember}
                onChange={(e) => setUser({ ...user, remember: e.target.checked })}
              />
              <label htmlFor="remember" className="ml-2 text-sm text-gray-700">
                Lembrar de mim
              </label>
            </div>
            
            <div
              onClick={handleSubmit}
              className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-lg flex items-center justify-center transition-colors cursor-pointer"
            >
              <LogIn className="mr-2" size={20} />
              Entrar
            </div>
            
            {userCreationEnabled && (
              <RouterLink to="/signup">
                <div className="w-full py-3 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium rounded-lg flex items-center justify-center transition-colors cursor-pointer">
                  <UserPlus className="mr-2" size={20} />
                  Cadastre-se
                </div>
              </RouterLink>
            )}
          </div>
          
          <div className="mt-6 text-center">
            <RouterLink to="/forgot-password" className="text-teal-600 hover:text-teal-800 text-sm inline-flex items-center">
              <HelpCircle size={16} className="mr-1" />
              Esqueceu a senha?
            </RouterLink>
          </div>
        </div>
        
        <div
          className="fixed bottom-5 right-5 bg-teal-600 hover:bg-teal-700 w-12 h-12 rounded-full flex items-center justify-center shadow-lg cursor-pointer animate-bounce hover:scale-110 transition-transform"
          onClick={() => window.open("https://wa.me/5541992098329")}
        >
          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
        </div>
      </div>
    </>
  );
}