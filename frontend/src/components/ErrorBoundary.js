import React from 'react';
import { Box, Typography, Button } from '@material-ui/core';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error:', error);
    console.error('Error Info:', errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Box 
          display="flex" 
          flexDirection="column" 
          alignItems="center" 
          justifyContent="center" 
          p={3}
        >
          <Typography variant="h6" gutterBottom>
            Algo deu errado.
          </Typography>
          <Button 
            color="primary" 
            variant="contained"
            onClick={() => window.location.reload()}
          >
            Recarregar página
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;