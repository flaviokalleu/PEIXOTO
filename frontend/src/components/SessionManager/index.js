import React, { useContext, useEffect, useState } from "react";
import { Snackbar, Alert } from "@material-ui/core";
import { AuthContext } from "../../context/Auth/AuthContext";

const SessionManager = () => {
  const { isAuth } = useContext(AuthContext);
  const [showWarning, setShowWarning] = useState(false);

  useEffect(() => {
    if (isAuth) {
      // Avisar quando o token estiver próximo de expirar (1h45min = 105 minutos)
      const warningTimeout = setTimeout(() => {
        setShowWarning(true);
      }, 105 * 60 * 1000); // 105 minutos

      return () => clearTimeout(warningTimeout);
    }
  }, [isAuth]);

  const handleCloseWarning = () => {
    setShowWarning(false);
  };

  return (
    <Snackbar
      open={showWarning}
      autoHideDuration={10000}
      onClose={handleCloseWarning}
      anchorOrigin={{ vertical: 'top', horizontal: 'center' }}
    >
      <Alert onClose={handleCloseWarning} severity="warning" variant="filled">
        Sua sessão expirará em breve. Salve seu trabalho para evitar perda de dados.
      </Alert>
    </Snackbar>
  );
};

export default SessionManager;
