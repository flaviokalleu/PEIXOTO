import React, { useContext, useState } from "react";
import {
  Stepper,
  Step,
  StepLabel,
  Button,
  Typography,
  CircularProgress,
} from "@material-ui/core";
import { Formik, Form } from "formik";

import AddressForm from "./Forms/AddressForm";
import PaymentForm from "./Forms/PaymentForm";
import ReviewOrder from "./ReviewOrder";
import CheckoutSuccess from "./CheckoutSuccess";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import { AuthContext } from "../../context/Auth/AuthContext";

import validationSchema from "./FormModel/validationSchema";
import checkoutFormModel from "./FormModel/checkoutFormModel";
import formInitialValues from "./FormModel/formInitialValues";

import useStyles from "./styles";

export default function CheckoutPage(props) {
  const steps = ["Dados", "Personalizar", "Revisar"];
  const { formId, formField } = checkoutFormModel;

  const classes = useStyles();
  const [activeStep, setActiveStep] = useState(1);
  const [datePayment, setDatePayment] = useState(null);
  const [invoiceId, setinvoiceId] = useState(props.Invoice.id);
  const currentValidationSchema = validationSchema[activeStep];
  const isLastStep = activeStep === steps.length - 1;
  const { user, socket } = useContext(AuthContext);

  function _renderStepContent(step, setFieldValue, setActiveStep, values) {
    // Debug: mostrar valores em cada step
    console.log(`=== STEP ${step} - Valores atuais ===`, values);
    
    switch (step) {
      case 0:
        return <AddressForm formField={formField} values={values} setFieldValue={setFieldValue} />;
      case 1:
        return <PaymentForm
          formField={formField}
          setFieldValue={setFieldValue}
          setActiveStep={setActiveStep}
          activeStep={step}
          invoiceId={invoiceId}
          values={values}
        />;
      case 2:
        return <ReviewOrder />;
      default:
        return <div>Not Found</div>;
    }
  }

  async function _submitForm(values, actions) {
    try {
      console.log("=== INICIANDO PROCESSO DE PAGAMENTO ===");
      console.log("Values recebidos:", values);
      console.log("Todas as chaves disponíveis:", Object.keys(values));
      console.log("User context:", user);
      
      // Validação dos dados do plano
      if (!values.plan) {
        throw new Error("Plano não selecionado");
      }

      let plan;
      try {
        plan = JSON.parse(values.plan);
        console.log("Plano parseado:", plan);
      } catch (parseError) {
        console.error("Erro ao fazer parse do plano:", parseError);
        throw new Error("Dados do plano inválidos");
      }

      // Mapear campos do usuário se necessário
      const firstName = values.firstName || values.name?.split(' ')[0] || user?.name?.split(' ')[0] || '';
      const lastName = values.lastName || values.name?.split(' ').slice(1).join(' ') || user?.name?.split(' ').slice(1).join(' ') || '';
      
      console.log("Mapeamento de nomes:");
      console.log("firstName:", firstName);
      console.log("lastName:", lastName);
      console.log("values.name:", values.name);
      console.log("user.name:", user?.name);

      // Campos de cartão - verificar se existem
      console.log("Dados do cartão:");
      console.log("nameOnCard:", values.nameOnCard);
      console.log("cardNumber:", values.cardNumber);
      console.log("cvv:", values.cvv);
      console.log("expiryDate:", values.expiryDate);

      // Se os campos de pagamento estão vazios, pode ser que não foram preenchidos nos steps anteriores
      if (!values.nameOnCard && !values.cardNumber && !values.cvv) {
        console.warn("ATENÇÃO: Campos de pagamento não preenchidos. Verificar formulários anteriores.");
        // Em vez de parar, vamos continuar para ver a resposta da API
      }

      const newValues = {
        firstName: firstName,
        lastName: lastName,
        address2: values.address2,
        city: values.city,
        state: values.state,
        zipcode: values.zipcode,
        country: values.country,
        useAddressForPaymentDetails: values.useAddressForPaymentDetails,
        nameOnCard: values.nameOnCard || `${firstName} ${lastName}`,
        cardNumber: values.cardNumber,
        cvv: values.cvv,
        expiryDate: values.expiryDate,
        plan: values.plan,
        price: plan.price,
        users: plan.users,
        connections: plan.connections,
        invoiceId: invoiceId
      };

      console.log("Dados sendo enviados para API:", newValues);
      console.log("URL da requisição:", "/subscription");

      // Fazer a requisição
      const response = await api.post("/subscription", newValues);
      
      console.log("=== RESPOSTA DA API ===");
      console.log("Status:", response.status);
      console.log("Headers:", response.headers);
      console.log("Data completa:", response.data);
      console.log("Tipo da resposta:", typeof response.data);

      // Verificar se a resposta contém dados válidos
      if (!response.data) {
        console.error("Resposta vazia da API");
        throw new Error("Resposta inválida do servidor");
      }

      // Se a resposta é apenas texto "200", pode ser um problema na API
      if (typeof response.data === 'string' && response.data.trim() === '200') {
        console.error("API retornou apenas status 200 como string - possível erro na API");
        throw new Error("Erro no processamento do pagamento. Tente novamente.");
      }

      // Verificar se contém dados de pagamento esperados
      if (typeof response.data === 'object') {
        console.log("Dados de pagamento recebidos:", response.data);
        
        // Verificar se tem dados PIX ou outros meios de pagamento
        if (response.data.pix || response.data.paymentUrl || response.data.qrCode) {
          console.log("Dados de pagamento válidos encontrados");
          setDatePayment(response.data);
          actions.setSubmitting(false);
          setActiveStep(activeStep + 1);
          toast.success("Assinatura realizada com sucesso! Aguardando a realização do pagamento");
        } else {
          console.warn("Resposta não contém dados de pagamento esperados");
          console.log("Estrutura da resposta:", Object.keys(response.data));
          
          // Mesmo assim, continuar o fluxo mas alertar
          setDatePayment(response.data);
          actions.setSubmitting(false);
          setActiveStep(activeStep + 1);
          toast.warning("Pagamento processado, mas verifique os dados de pagamento");
        }
      } else {
        console.error("Formato de resposta inesperado:", typeof response.data);
        throw new Error("Formato de resposta inválido do servidor");
      }

    } catch (err) {
      console.error("=== ERRO NO PAGAMENTO ===");
      console.error("Erro completo:", err);
      console.error("Mensagem:", err.message);
      console.error("Response:", err.response);
      
      if (err.response) {
        console.error("Status do erro:", err.response.status);
        console.error("Data do erro:", err.response.data);
        console.error("Headers do erro:", err.response.headers);
      }
      
      actions.setSubmitting(false);
      toastError(err);
    }
  }

  function _handleSubmit(values, actions) {
    console.log("HandleSubmit chamado - Step:", activeStep, "IsLastStep:", isLastStep);
    
    if (isLastStep) {
      _submitForm(values, actions);
    } else {
      setActiveStep(activeStep + 1);
      actions.setTouched({});
      actions.setSubmitting(false);
    }
  }

  function _handleBack() {
    setActiveStep(activeStep - 1);
  }

  return (
    <React.Fragment>
      <Typography component="h1" variant="h4" align="center">
        Falta pouco!
      </Typography>
      <Stepper activeStep={activeStep} className={classes.stepper}>
        {steps.map((label) => (
          <Step key={label}>
            <StepLabel>{label}</StepLabel>
          </Step>
        ))}
      </Stepper>
      <React.Fragment>
        {activeStep === steps.length ? (
          <CheckoutSuccess pix={datePayment} />
        ) : (
          <Formik
            initialValues={{
              ...user,
              ...formInitialValues
            }}
            validationSchema={currentValidationSchema}
            onSubmit={_handleSubmit}
          >
            {({ isSubmitting, setFieldValue, values }) => (
              <Form id={formId}>
                {/* Debug Info */}
                <div style={{ 
                  background: '#f5f5f5', 
                  padding: '10px', 
                  margin: '10px 0', 
                  fontSize: '12px',
                  border: '1px solid #ddd'
                }}>
                  <strong>DEBUG - Step {activeStep}:</strong><br/>
                  <strong>Nome:</strong> {values.name || values.firstName} {values.lastName}<br/>
                  <strong>Email:</strong> {values.email}<br/>
                  <strong>Cartão:</strong> {values.nameOnCard}<br/>
                  <strong>Número:</strong> {values.cardNumber ? '****' + values.cardNumber.slice(-4) : 'N/A'}<br/>
                  <strong>CVV:</strong> {values.cvv ? '***' : 'N/A'}<br/>
                  <strong>Plano:</strong> {values.plan ? JSON.parse(values.plan).title : 'N/A'}
                </div>

                {_renderStepContent(activeStep, setFieldValue, setActiveStep, values)}

                <div className={classes.buttons}>
                  {activeStep !== 1 && activeStep !== 0 && (
                    <Button onClick={_handleBack} className={classes.button}>
                      VOLTAR
                    </Button>
                  )}
                  <div className={classes.wrapper}>
                    {activeStep !== 1 && (
                      <Button
                        disabled={isSubmitting}
                        type="submit"
                        variant="contained"
                        color="primary"
                        className={classes.button}
                        onClick={() => console.log("Botão PAGAR clicado - Values:", values)}
                      >
                        {isLastStep ? "PAGAR" : "PRÓXIMO"}
                      </Button>
                    )}
                    {isSubmitting && (
                      <CircularProgress
                        size={24}
                        className={classes.buttonProgress}
                      />
                    )}
                  </div>
                </div>
              </Form>
            )}
          </Formik>
        )}
      </React.Fragment>
    </React.Fragment>
  );
}