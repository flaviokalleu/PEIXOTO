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
  const [invoiceId, ] = useState(props.Invoice.id);
  const [paymentText, setPaymentText] = useState("");
  const currentValidationSchema = validationSchema[activeStep];
  const isLastStep = activeStep === steps.length - 1;
  const { user } = useContext(AuthContext);

  function _renderStepContent(step, setFieldValue, setActiveStep, values ) {

    switch (step) {
      case 0:
        return <AddressForm formField={formField} values={values} setFieldValue={setFieldValue}  />;
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
      if (!values.plan) {
        throw new Error("Plano não selecionado");
      }

      const plan = JSON.parse(values.plan);
      
      // Format the payload
      const payload = {
        firstName: values.firstName?.trim(),
        lastName: values.lastName?.trim(),
        address2: values.address2?.trim(),
        city: values.city?.trim(),
        state: values.state?.trim(),
        zipcode: values.zipcode?.trim(),
        country: values.country?.trim(),
        useAddressForPaymentDetails: values.useAddressForPaymentDetails,
        nameOnCard: values.nameOnCard?.trim(),
        cardNumber: values.cardNumber?.replace(/\D/g, ''),

        cvv: values.cvv?.trim(),
        plan: values.plan,
        price: plan.price,
        users: plan.users,
        connections: plan.connections,
        invoiceId: invoiceId
      };

      // Make API call with authorization header
      const { data } = await api.post("/subscription", payload, {
        headers: {
          'Content-Type': 'application/json',
          // Make sure the token is being passed from your auth context
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!data) {
        throw new Error("Erro ao processar assinatura");
      }

      if (data.urlMcPg) {
        setDatePayment(data);
        setPaymentText("Ao realizar o pagamento, atualize a página!");
        window.open(data.urlMcPg, '_blank');
        actions.setSubmitting(false);
        toast.success("Assinatura realizada com sucesso! Aguardando a realização do pagamento");
      } else {
        throw new Error("URL de pagamento não gerada");
      }

    } catch (err) {
      actions.setSubmitting(false);
      
      if (err.response?.status === 401) {
        toast.error("Sessão expirada. Por favor, faça login novamente.");
        // Redirect to login or refresh token
        return;
      }

      if (err.response?.status === 400 && err.response?.data?.message?.includes("Token do Mercado Pago")) {
        toast.error("Erro de configuração: " + err.response.data.message);
        console.error("Erro de configuração do Mercado Pago:", err.response.data);
        return;
      }

      const errorMessage = err.response?.data?.message || err.message || "Erro ao processar pagamento";
      toast.error(errorMessage);
      console.error("Erro no checkout:", err.response?.data || err.message);
    }
  }

  function _handleSubmit(values, actions) {
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
                {_renderStepContent(activeStep, setFieldValue, setActiveStep, values)}

                <div className={classes.buttons}>
                  {activeStep !== 1 && (
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
                {paymentText && (
  <div style={{ backgroundColor: '#f0f0f0', padding: '10px', borderRadius: '8px', marginTop: '10px' }}>
    <Typography variant="h5" align="center" style={{ color: '#ff5722', fontWeight: 'bold', fontFamily: 'cursive' }}>
      {paymentText}
    </Typography>
  </div>
)}
              </Form>
            )}
          </Formik>
        )}
      </React.Fragment>
    </React.Fragment>
  );
}
