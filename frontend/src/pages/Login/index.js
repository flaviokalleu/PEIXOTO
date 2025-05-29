import React, { useState, useEffect, useContext } from "react";
import { Link as RouterLink } from "react-router-dom";
import { Mail, Lock, Eye, EyeOff, LogIn, UserPlus, HelpCircle, MessageCircle } from "lucide-react";
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
      
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          {/* Card principal */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm p-8">
            {/* Cabeçalho */}
            <div className="text-center mb-8">
              <div className="w-12 h-12 bg-blue-600 dark:bg-blue-500 rounded-lg mx-auto mb-4 flex items-center justify-center">
                <LogIn size={24} className="text-white" />
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">Bem-vindo</h1>
              <p className="text-gray-600 dark:text-gray-400 text-sm">Entre com suas credenciais</p>
            </div>
            
            {/* Mensagem de erro */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-400 text-sm p-3 rounded-md mb-6">
                {error}
              </div>
            )}
            
            {/* Formulário */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Campo de Email */}
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Email
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400 dark:text-gray-500">
                    <Mail size={18} />
                  </div>
                  <input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    className="w-full pl-10 pr-4 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    value={user.email}
                    onChange={(e) => setUser({ ...user, email: e.target.value })}
                  />
                </div>
              </div>
              
              {/* Campo de Senha */}
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Senha
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-gray-400 dark:text-gray-500">
                    <Lock size={18} />
                  </div>
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-12 py-3 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    value={user.password}
                    onChange={(e) => setUser({ ...user, password: e.target.value })}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>
              
              {/* Checkbox Lembrar */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="remember"
                  className="w-4 h-4 text-blue-600 bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 rounded focus:ring-blue-500 focus:ring-2"
                  checked={user.remember}
                  onChange={(e) => setUser({ ...user, remember: e.target.checked })}
                />
                <label htmlFor="remember" className="ml-3 text-sm text-gray-700 dark:text-gray-300">
                  Lembrar de mim
                </label>
              </div>
              
              {/* Botão de Login */}
              <button
                type="submit"
                className="w-full py-3 bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-700 text-white font-medium rounded-md flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
              >
                <LogIn className="mr-2" size={18} />
                Entrar
              </button>
              
              {/* Botão de Cadastro */}
              {userCreationEnabled && (
                <RouterLink to="/signup">
                  <button
                    type="button"
                    className="w-full py-3 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium rounded-md flex items-center justify-center transition-colors border border-gray-300 dark:border-gray-600"
                  >
                    <UserPlus className="mr-2" size={18} />
                    Cadastre-se
                  </button>
                </RouterLink>
              )}
            </form>
            
            {/* Link Esqueceu a senha */}
            <div className="mt-6 text-center">
              <RouterLink 
                to="/forgot-password" 
                className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 text-sm inline-flex items-center transition-colors"
              >
                <HelpCircle size={16} className="mr-1" />
                Esqueceu a senha?
              </RouterLink>
            </div>
          </div>
        </div>
        
        {/* Botão WhatsApp flutuante */}
        <button
          className="fixed bottom-6 right-6 bg-green-500 hover:bg-green-600 dark:bg-green-600 dark:hover:bg-green-700 w-12 h-12 rounded-full flex items-center justify-center shadow-lg cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
          onClick={() => window.open("https://wa.me/558521369438")}
          aria-label="Contato via WhatsApp"
        >
          <MessageCircle className="w-6 h-6 text-white" />
        </button>
      </div>
    </>
  );
}