import React from 'react';
import { Route, Redirect } from 'react-router-dom';

const SubscriptionRoute = ({ component: Component, ...rest }) => {
  const forceFinanceiro = localStorage.getItem("forceFinanceiro") === "true";
  const isFinanceiroRoute = rest.path === "/financeiro";

  return (
    <Route
      {...rest}
      render={props =>
        forceFinanceiro && !isFinanceiroRoute ? (
          <Redirect to="/financeiro" />
        ) : (
          <Component {...props} />
        )
      }
    />
  );
};

export default SubscriptionRoute;