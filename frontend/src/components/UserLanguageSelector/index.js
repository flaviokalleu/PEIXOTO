import React, { useContext, useState } from "react";
import { Menu, MenuItem } from "@material-ui/core";
import { Languages } from "lucide-react";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import toastError from "../../errors/toastError";
import api from "../../services/api";

const UserLanguageSelector = () => {
  const [anchorEl, setAnchorEl] = useState(null);
  const { user } = useContext(AuthContext);

  const handleOpenLanguageMenu = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleCloseLanguageMenu = () => {
    setAnchorEl(null);
  };

  const handleChangeLanguage = async (language) => {
    try {
      await i18n.changeLanguage(language);
      await api.put(`/users/${user.id}`, { language });
    } catch (err) {
      toastError(err);
    }

    handleCloseLanguageMenu();
  };

  return (
    <>
      <button
        onClick={handleOpenLanguageMenu}
        className="p-2 focus:outline-none"
        aria-label="Selecionar idioma"
        style={{ background: 'transparent', border: 'none' }}
      >
        <Languages color="white" size={24} />
      </button>
      
      <Menu
        anchorEl={anchorEl}
        keepMounted
        open={Boolean(anchorEl)}
        onClose={handleCloseLanguageMenu}
      >
        <MenuItem onClick={() => handleChangeLanguage("pt-BR")}>
          {i18n.t("languages.pt-BR")}
        </MenuItem>
        <MenuItem onClick={() => handleChangeLanguage("en")}>
          {i18n.t("languages.en")}
        </MenuItem>
        <MenuItem onClick={() => handleChangeLanguage("es")}>
          {i18n.t("languages.es")}
        </MenuItem>
        <MenuItem onClick={() => handleChangeLanguage("tr")}>
          {i18n.t("languages.tr")}
        </MenuItem>
      </Menu>
    </>
  );
};

export default UserLanguageSelector;