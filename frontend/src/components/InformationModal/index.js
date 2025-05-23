import React from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Typography } from '@material-ui/core';
import { makeStyles } from '@material-ui/core/styles';
import PropTypes from 'prop-types';
import { i18n } from '../../translate/i18n';

const useStyles = makeStyles((theme) => ({
  content: {
    whiteSpace: 'pre-wrap',
    padding: theme.spacing(2),
    lineHeight: 1.5,
  },
}));

const InformationModal = ({ title, children, open, onClose }) => {
  const classes = useStyles();

  return (
    <Dialog
      open={open}
      onClose={onClose}
      aria-labelledby="information-dialog-title"
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle id="information-dialog-title">{title}</DialogTitle>
      <DialogContent dividers>
        <Typography className={classes.content}>
          {children || 'Nenhuma informação disponível.'}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button
          variant="outlined"
          color="primary"
          onClick={onClose}
        >
          {i18n.t("Fechar")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

InformationModal.propTypes = {
  title: PropTypes.string.isRequired,
  children: PropTypes.node,
  open: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
};

export default InformationModal;