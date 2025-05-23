import React, { useState, useEffect, useContext } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import Container from "@material-ui/core/Container";
import Select from "@material-ui/core/Select";
import TextField from "@material-ui/core/TextField";
import { toast } from "react-toastify";
import api from "../../services/api";
import { i18n } from "../../translate/i18n.js";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { Can } from "../../components/Can";
import ForbiddenPage from "../../components/ForbiddenPage";

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    alignItems: "center",
    padding: theme.spacing(8, 8, 3) || theme.padding,
  },
  paper: {
    padding: theme.spacing(2) || theme.padding,
    display: "flex",
    alignItems: "center",
    marginBottom: 12,
  },
  settingOption: {
    marginLeft: "auto",
  },
  margin: {
    margin: theme.spacing(1) || theme.padding,
  },
}));

const Settings = () => {
  const classes = useStyles();
  const { user, socket } = useContext(AuthContext);
  const [settings, setSettings] = useState([]);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const { data } = await api.get("/settings");
        setSettings(data);
      } catch (err) {
        toastError(err);
      }
    };
    fetchSession();
  }, []);

  useEffect(() => {
    const companyId = user.companyId;
    const onSettingsEvent = (data) => {
      if (data.action === "update") {
        setSettings((prevState) => {
          const aux = [...prevState];
          const settingIndex = aux.findIndex((s) => s.key === data.setting.key);
          aux[settingIndex].value = data.setting.value;
          return aux;
        });
      }
    };
    socket.on(`company-${companyId}-settings`, onSettingsEvent);
    return () => {
      socket.off(`company-${companyId}-settings`, onSettingsEvent);
    };
  }, [socket, user.companyId]);

  const handleChangeSetting = async (e) => {
    const selectedValue = e.target.value;
    const settingKey = e.target.name;
    try {
      await api.put(`/settings/${settingKey}`, {
        value: selectedValue,
      });
      toast.success(i18n.t("settings.success"));
    } catch (err) {
      toastError(err);
    }
  };

  const getSettingValue = (key) => {
    const setting = settings.find((s) => s.key === key);
    return setting ? setting.value : "";
  };

  return (
    <div className={classes.root}>
      <Can
        role={user.profile}
        perform="settings-page:view"
        yes={() => (
          <Container className={classes.container} maxWidth="sm">
            <Typography variant="body2" gutterBottom>
              {i18n.t("settings.title")}
            </Typography>
            <Paper className={classes.paper}>
              <Typography variant="body1">
                {i18n.t("settings.settings.userCreation.name")}
              </Typography>
              <Select
                margin="dense"
                variant="outlined"
                native
                id="userCreation-setting"
                name="userCreation"
                value={
                  settings && settings.length > 0
                    ? getSettingValue("userCreation")
                    : ""
                }
                className={classes.settingOption}
                onChange={handleChangeSetting}
              >
                <option value="enabled">
                  {i18n.t("settings.settings.userCreation.options.enabled")}
                </option>
                <option value="disabled">
                  {i18n.t("settings.settings.userCreation.options.disabled")}
                </option>
              </Select>
            </Paper>
            <Paper className={classes.paper}>
              <TextField
                id="api-token-setting"
                label="Token Api"
                margin="dense"
                variant="outlined"
                fullWidth
                value={
                  settings && settings.length > 0
                    ? getSettingValue("userApiToken")
                    : ""
                }
                InputProps={{
                  readOnly: true,
                }}
              />
            </Paper>
            <Paper className={classes.paper}>
              <TextField
                id="hub-token-setting"
                label="Hub Token"
                name="hubToken"
                margin="dense"
                variant="outlined"
                fullWidth
                value={
                  settings && settings.length > 0
                    ? getSettingValue("hubToken")
                    : ""
                }
                onChange={handleChangeSetting}
                InputProps={{
                  style: { filter: "blur(5px)" },
                  readOnly: true,
                }}
              />
            </Paper>
          </Container>
        )}
        no={() => <ForbiddenPage />}
      />
    </div>
  );
};

export default Settings;