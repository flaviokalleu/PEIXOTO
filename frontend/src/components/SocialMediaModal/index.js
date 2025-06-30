import React, { useContext, useState } from "react";
import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import CircularProgress from "@material-ui/core/CircularProgress";
import InstagramIcon from "@material-ui/icons/Instagram";
import FacebookIcon from "@material-ui/icons/Facebook";
import Visibility from "@material-ui/icons/Visibility";
import VisibilityOff from "@material-ui/icons/VisibilityOff";
import InputAdornment from "@material-ui/core/InputAdornment";
import IconButton from "@material-ui/core/IconButton";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    flexWrap: "wrap",
  },
  multFieldLine: {
    display: "flex",
    "& > *:not(:last-child)": {
      marginRight: theme.spacing(1),
    },
  },
  btnWrapper: {
    position: "relative",
  },
  buttonProgress: {
    color: green[500],
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -12,
    marginLeft: -12,
  },
  instagramIcon: {
    color: "#C13584",
    marginRight: theme.spacing(1),
  },
  facebookIcon: {
    color: "#0084FF",
    marginRight: theme.spacing(1),
  },
}));

const SocialMediaSchema = Yup.object().shape({
  name: Yup.string().required("Obrigatório"),
  token: Yup.string().required("Obrigatório"),
});

const SocialMediaModal = ({ open, onClose, channelType }) => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const [showToken, setShowToken] = useState(false);

  const initialState = {
    name: "",
    token: "",
  };

  const handleClose = () => {
    onClose();
  };

  const handleSaveSocialMedia = async (values) => {
    try {
      const data = {
        name: values.name,
        qrcode: values.token,
        type: channelType,
      };

      console.log("Payload enviado para POST /hub-notificame:", data);
      
      await api.post("/hub-notificame", data);
      toast.success(i18n.t("Canal adicionado com sucesso!"));
      handleClose();
    } catch (err) {
      toastError(err);
    }
  };

  const getTitle = () => {
    if (channelType === "Instagram") {
      return (
        <>
          <InstagramIcon className={classes.instagramIcon} />
          {i18n.t("Adicionar Canal Instagram")}
        </>
      );
    }
    return (
      <>
        <FacebookIcon className={classes.facebookIcon} />
        {i18n.t("Adicionar Canal Facebook Messenger")}
      </>
    );
  };

  const handleClickShowToken = () => {
    setShowToken((prev) => !prev);
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="xs" fullWidth>
      <DialogTitle>{getTitle()}</DialogTitle>
      <Formik
        initialValues={initialState}
        enableReinitialize={true}
        validationSchema={SocialMediaSchema}
        onSubmit={handleSaveSocialMedia}
      >
        {({ values, touched, errors, isSubmitting }) => (
          <Form>
            <DialogContent dividers>
              <Field
                as={TextField}
                label={i18n.t("Nome")}
                name="name"
                error={touched.name && Boolean(errors.name)}
                helperText={touched.name && errors.name}
                variant="outlined"
                margin="dense"
                fullWidth
              />
              <Field
                as={TextField}
                label={i18n.t("Token")}
                name="token"
                type={showToken ? "text" : "password"}
                error={touched.token && Boolean(errors.token)}
                helperText={touched.token && errors.token}
                variant="outlined"
                margin="dense"
                fullWidth
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        aria-label="toggle token visibility"
                        onClick={handleClickShowToken}
                        edge="end"
                      >
                        {showToken ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </DialogContent>
            <DialogActions>
              <Button
                onClick={handleClose}
                color="secondary"
                disabled={isSubmitting}
                variant="outlined"
              >
                {i18n.t("Cancelar")}
              </Button>
              <Button
                type="submit"
                color="primary"
                disabled={isSubmitting}
                variant="contained"
                className={classes.btnWrapper}
              >
                {i18n.t("Salvar")}
                {isSubmitting && (
                  <CircularProgress size={24} className={classes.buttonProgress} />
                )}
              </Button>
            </DialogActions>
          </Form>
        )}
      </Formik>
    </Dialog>
  );
};

export default SocialMediaModal;