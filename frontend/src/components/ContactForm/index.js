import React, { useState, useEffect, useContext } from "react";

import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import { toast } from "react-toastify";

import { makeStyles } from "@material-ui/core/styles";
import { green } from "@material-ui/core/colors";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import CircularProgress from "@material-ui/core/CircularProgress";

import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { Grid } from "@material-ui/core";

const useStyles = makeStyles(theme => ({
	root: {
		display: "flex",
		flexWrap: "wrap",
	},
	textField: {
		marginRight: theme.spacing(1),
		flex: 1,
	},

	extraAttr: {
		display: "flex",
		justifyContent: "center",
		alignItems: "center",
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

    textCenter: {
        backgroundColor: 'red'
    }
}));

const ContactSchema = Yup.object().shape({
	name: Yup.string()
		.min(2, "Too Short!")
		.max(50, "Too Long!")
		.required("Required"),
	number: Yup.string().min(8, "Too Short!").max(50, "Too Long!"),
	email: Yup.string().email("Invalid email"),
});

export function ContactForm ({ initialContact, onSave, onCancel }) {
	const classes = useStyles();
	const { user } = useContext(AuthContext);

	const [contact, setContact] = useState(initialContact);
	const [whatsapps, setWhatsapps] = useState([]);

    useEffect(() => {
        setContact(initialContact);
    }, [initialContact]);

	// Buscar WhatsApps disponíveis quando o componente carrega
	useEffect(() => {
		const fetchWhatsapps = async () => {
			if (!user?.companyId) return;
			
			try {
				const { data } = await api.get(`/whatsapp?companyId=${user.companyId}`);
				setWhatsapps(data || []);
			} catch (err) {
				console.error("Erro ao buscar WhatsApps:", err);
			}
		};

		if (user?.companyId) {
			fetchWhatsapps();
		}
	}, [user]);

	// Função para obter WhatsApp padrão
	const getDefaultWhatsapp = async () => {
		if (!user?.companyId) return null;
		
		try {
			const { data } = await api.get(`/whatsapp/default?companyId=${user.companyId}`);
			return data?.id || (whatsapps.length > 0 ? whatsapps[0].id : null);
		} catch (err) {
			console.error("Erro ao buscar WhatsApp padrão:", err);
			return whatsapps.length > 0 ? whatsapps[0].id : null;
		}
	};

	const handleSaveContact = async values => {
		try {
			// Garantir que temos os dados do usuário
			if (!user || !user.companyId || !user.id) {
				toast.error("Erro: Dados do usuário não encontrados. Faça login novamente.");
				return;
			}

			// Preparar dados garantindo que companyId e userId sejam números
			const contactData = {
				...values,
				companyId: parseInt(user.companyId, 10), // Garantir que seja número
				userId: parseInt(user.id, 10), // Garantir que seja número
			};

			// Se não for edição, precisamos de um whatsappId
			if (!contact.id) {
				if (!contactData.whatsappId) {
					const defaultWhatsappId = await getDefaultWhatsapp();
					if (defaultWhatsappId) {
						contactData.whatsappId = parseInt(defaultWhatsappId, 10);
					} else {
						toast.error("Erro: Nenhum WhatsApp disponível. Configure um WhatsApp para a empresa.");
						return;
					}
				} else {
					contactData.whatsappId = parseInt(contactData.whatsappId, 10);
				}
			}

			// Limpar campos opcionais vazios
			if (!contactData.number || contactData.number.trim() === '') {
				delete contactData.number;
			}
			
			if (!contactData.email || contactData.email.trim() === '') {
				delete contactData.email;
			}

			// Debug detalhado
			console.log("=== DEBUG DETALHADO ===");
			console.log("User:", user);
			console.log("Contact ID:", contact.id);
			console.log("Dados sendo enviados:");
			console.log("- companyId:", contactData.companyId, "(tipo:", typeof contactData.companyId, ")");
			console.log("- userId:", contactData.userId, "(tipo:", typeof contactData.userId, ")");
			console.log("- whatsappId:", contactData.whatsappId, "(tipo:", typeof contactData.whatsappId, ")");
			console.log("- name:", contactData.name);
			console.log("- number:", contactData.number);
			console.log("- email:", contactData.email);
			console.log("Objeto completo:", JSON.stringify(contactData, null, 2));
			console.log("=== FIM DEBUG ===");

			if (contact.id) {
				await api.put(`/contacts/${contact.id}`, contactData);
			} else {
				const { data } = await api.post("/contacts", contactData);
				if (onSave) {
					onSave(data);
				}
			}
			toast.success(i18n.t("contactModal.success"));
		} catch (err) {
			console.error("=== ERRO COMPLETO ===");
			console.error("Status:", err.response?.status);
			console.error("Data:", err.response?.data);
			console.error("Message:", err.response?.data?.message);
			console.error("Full error:", err);
			console.error("=== FIM ERRO ===");
			
			// Mostrar erro específico
			if (err.response?.data?.message) {
				toast.error(`Erro: ${err.response.data.message}`);
			} else {
				toastError(err);
			}
		}
	};

	// Não renderizar se não tiver dados do usuário
	if (!user || !user.companyId) {
		return <div>Carregando dados do usuário...</div>;
	}

    return (
        <Formik
            initialValues={contact}
            enableReinitialize={true}
            validationSchema={ContactSchema}
            onSubmit={(values, actions) => {
                setTimeout(() => {
                    handleSaveContact(values);
                    actions.setSubmitting(false);
                }, 400);
            }}
        >
            {({ values, errors, touched, isSubmitting }) => (
                <Form>
                    <Grid container spacing={1}>
                        <Grid item xs={12}>
                            <Field
                                as={TextField}
                                label={i18n.t("contactModal.form.name")}
                                name="name"
                                autoFocus
                                error={touched.name && Boolean(errors.name)}
                                helperText={touched.name && errors.name}
                                variant="outlined"
                                margin="dense"
                                className={classes.textField}
                                fullWidth
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Field
                                as={TextField}
                                label={i18n.t("contactModal.form.number")}
                                name="number"
                                error={touched.number && Boolean(errors.number)}
                                helperText={touched.number && errors.number}
                                placeholder="5513912344321"
                                variant="outlined"
                                margin="dense"
                                fullWidth
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <Field
                                as={TextField}
                                label={i18n.t("contactModal.form.email")}
                                name="email"
                                error={touched.email && Boolean(errors.email)}
                                helperText={touched.email && errors.email}
                                placeholder="Email address"
                                fullWidth
                                margin="dense"
                                variant="outlined"
                            />
                        </Grid>
                        
                        {/* Campo debug - remover em produção */}
                        <Grid item xs={12}>
                            <div style={{ 
                                background: '#f5f5f5', 
                                padding: '10px', 
                                borderRadius: '4px',
                                fontSize: '12px',
                                marginTop: '8px'
                            }}>
                                <strong>Debug Info:</strong><br/>
                                User ID: {user?.id}<br/>
                                Company ID: {user?.companyId}<br/>
                                WhatsApps disponíveis: {whatsapps.length}
                            </div>
                        </Grid>

                        <Grid item xs={12} spacing={1}>
                            <Grid container spacing={1}>
                                <Grid xs={6} item>
                                    <Button
                                        onClick={onCancel}
                                        color="secondary"
                                        disabled={isSubmitting}
                                        variant="outlined"
                                        fullWidth
                                    >
                                        {i18n.t("contactModal.buttons.cancel")}
                                    </Button>
                                </Grid>
                                <Grid classes={classes.textCenter} xs={6} item>
                                    <Button
                                        type="submit"
                                        color="primary"
                                        disabled={isSubmitting}
                                        variant="contained"
                                        className={classes.btnWrapper}
                                        fullWidth
                                    >
                                        {contact.id
                                            ? `${i18n.t("contactModal.buttons.okEdit")}`
                                            : `${i18n.t("contactModal.buttons.okAdd")}`}
                                        {isSubmitting && (
                                            <CircularProgress
                                                size={24}
                                                className={classes.buttonProgress}
                                            />
                                        )}
                                    </Button>
                                </Grid>
                            </Grid>
                        </Grid>
                    </Grid>
                </Form>
            )}
        </Formik>
    )
}