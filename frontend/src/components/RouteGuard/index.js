import React, { useContext, useEffect } from 'react';
import { Route, Redirect, useHistory } from 'react-router-dom';
import { AuthContext } from '../../context/Auth/AuthContext';
import { toast } from 'react-toastify';
import CircularProgress from '@material-ui/core/CircularProgress';

const RouteGuard = ({ component: Component, isFinancial = false, ...rest }) => {
  const { user, loading } = useContext(AuthContext);
  const history = useHistory();

  const hasUnpaidInvoices = () => {
    if (user?.company?.id === 1) return false; // Super admin bypass
    if (!user?.company?.invoices?.length) return false;
    
    return user.company.invoices.some(invoice => 
      invoice.companyId === user.company.id && 
      invoice.status !== "paid"
    );
  };

  // Force check and redirect on every route change or mount
  useEffect(() => {
    const unpaid = hasUnpaidInvoices();
    if (unpaid && !isFinancial) {
      toast.error('Você possui faturas pendentes. Por favor, regularize seu pagamento.');
      history.replace('/financeiro');
    }
  }, [history, isFinancial, user, rest.path]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </div>
    );
  }

  return (
    <Route
      {...rest}
      render={props => {
        // Double check to ensure redirect even with direct URL access
        if (hasUnpaidInvoices() && !isFinancial) {
          return (
            <Redirect
              to={{
                pathname: "/financeiro",
                state: { from: props.location }
              }}
            />
          );
        }

        return <Component {...props} />;
      }}
    />
  );
};

export default RouteGuard;