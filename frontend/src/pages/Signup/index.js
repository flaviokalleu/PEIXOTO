import React, { useState, useEffect } from "react";
import qs from "query-string";
import * as Yup from "yup";
import { useHistory } from "react-router-dom";
import { Link as RouterLink } from "react-router-dom";
import { toast } from "react-toastify";
import { Formik, Form, Field } from "formik";
import usePlans from "../../hooks/usePlans";
import { i18n } from "../../translate/i18n";
import { openApi } from "../../services/api";
import toastError from "../../errors/toastError";

const UserSchema = Yup.object().shape({
  name: Yup.string()
    .min(2, "Too Short!")
    .max(50, "Too Long!")
    .required("Required"),
  companyName: Yup.string()
    .min(2, "Too Short!")
    .max(50, "Too Long!")
    .required("Required"),
  password: Yup.string().min(5, "Too Short!").max(50, "Too Long!"),
  email: Yup.string().email("Invalid email").required("Required"),
  phone: Yup.string().required("Required"),
});

const SignUp = () => {
  const history = useHistory();
  const { getPlanList } = usePlans();
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(false);
  const [userCreationEnabled, setUserCreationEnabled] = useState(true);

  let companyId = null;
  const params = qs.parse(window.location.search);
  if (params.companyId !== undefined) {
    companyId = params.companyId;
  }

  const initialState = {
    name: "",
    email: "",
    password: "",
    phone: "",
    companyId,
    companyName: "",
    planId: "",
  };

  const [user] = useState(initialState);

  // Determinar a URL do backend
  const backendUrl =
    process.env.REACT_APP_BACKEND_URL === "https://localhost:8090"
      ? "https://localhost:8090"
      : process.env.REACT_APP_BACKEND_URL;

  // Verificar status de userCreation ao carregar o componente
  useEffect(() => {
    const fetchUserCreationStatus = async () => {
      try {
        const response = await fetch(`${backendUrl}/public-settings/userCreation`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (response.ok) {
          const data = await response.json();
          console.log("UserCreation data:", data);
          
          // Verificar se o valor é "enabled"
          const isEnabled = data === "enabled" || (data && data.value === "enabled");
          setUserCreationEnabled(isEnabled);

          // Redirecionar para /login se userCreation estiver desabilitado
          if (!isEnabled) {
            toast.info("Cadastro de novos usuários está desabilitado.");
            history.push("/login");
          }
        } else {
          console.log("Could not fetch userCreation status, assuming enabled");
          // Se não conseguir buscar, assumir que está habilitado (mesmo comportamento do login)
          setUserCreationEnabled(true);
        }
      } catch (err) {
        console.error("Erro ao verificar userCreation:", err);
        // Em caso de erro, assumir que está habilitado para não bloquear
        setUserCreationEnabled(true);
      }
    };

    fetchUserCreationStatus();
  }, [backendUrl, history]);

  useEffect(() => {
    setLoading(true);
    const fetchData = async () => {
      const planList = await getPlanList({ listPublic: "false" });
      setPlans(planList);
      setLoading(false);
    };
    fetchData();
  }, [getPlanList]);

  const handleSignUp = async (values) => {
    try {
      await openApi.post("/auth/signup", values);
      toast.success(i18n.t("signup.toasts.success"));
      history.push("/login");
    } catch (err) {
      toastError(err);
    }
  };

  // Renderizar apenas se userCreation estiver habilitado
  if (!userCreationEnabled) {
    return null; // Ou um componente de loading/spinner, se preferir
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          <div className="mx-auto h-16 w-16 bg-blue-600 rounded-full flex items-center justify-center shadow-lg">
            <svg
              className="h-8 w-8 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="mt-6 text-3xl font-bold text-gray-900">
            {i18n.t("signup.title")}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Crie sua conta para começar
          </p>
        </div>

        <div className="bg-white py-8 px-6 shadow-xl rounded-lg border border-gray-100">
          <Formik
            initialValues={user}
            enableReinitialize={true}
            validationSchema={UserSchema}
            onSubmit={(values, actions) => {
              setTimeout(() => {
                handleSignUp(values);
                actions.setSubmitting(false);
              }, 400);
            }}
          >
            {({ touched, errors, isSubmitting }) => (
              <Form className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <label
                      htmlFor="companyName"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      {i18n.t("signup.form.company")}
                    </label>
                    <Field
                      type="text"
                      name="companyName"
                      id="companyName"
                      autoComplete="companyName"
                      autoFocus
                      className={`appearance-none relative block w-full px-3 py-3 border ${
                        touched.companyName && errors.companyName
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                      } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-1 focus:z-10 sm:text-sm transition-colors duration-200`}
                      placeholder="Nome da empresa"
                    />
                    {touched.companyName && errors.companyName && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.companyName}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="name"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      {i18n.t("signup.form.name")}
                    </label>
                    <Field
                      type="text"
                      name="name"
                      id="name"
                      autoComplete="name"
                      className={`appearance-none relative block w-full px-3 py-3 border ${
                        touched.name && errors.name
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                      } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-1 focus:z-10 sm:text-sm transition-colors duration-200`}
                      placeholder="Seu nome completo"
                    />
                    {touched.name && errors.name && (
                      <p className="mt-1 text-sm text-red-600">{errors.name}</p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="email"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      {i18n.t("signup.form.email")}
                    </label>
                    <Field
                      type="email"
                      name="email"
                      id="email"
                      autoComplete="email"
                      className={`appearance-none relative block w-full px-3 py-3 border ${
                        touched.email && errors.email
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                      } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-1 focus:z-10 sm:text-sm transition-colors duration-200 lowercase`}
                      placeholder="seu@email.com"
                      style={{ textTransform: "lowercase" }}
                    />
                    {touched.email && errors.email && (
                      <p className="mt-1 text-sm text-red-600">{errors.email}</p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="password"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      {i18n.t("signup.form.password")}
                    </label>
                    <Field
                      type="password"
                      name="password"
                      id="password"
                      autoComplete="current-password"
                      className={`appearance-none relative block w-full px-3 py-3 border ${
                        touched.password && errors.password
                          ? "border-red-300 focus:border-red-500 focus:ring-red-500"
                          : "border-gray-300 focus:border-blue-500 focus:ring-blue-500"
                      } placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-1 focus:z-10 sm:text-sm transition-colors duration-200`}
                      placeholder="Sua senha"
                    />
                    {touched.password && errors.password && (
                      <p className="mt-1 text-sm text-red-600">
                        {errors.password}
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      htmlFor="phone"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      {i18n.t("signup.form.phone")}
                    </label>
                    <Field
                      type="text"
                      name="phone"
                      id="phone"
                      autoComplete="phone"
                      className="appearance-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm transition-colors duration-200"
                      placeholder="(00) 00000-0000"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="planId"
                      className="block text-sm font-medium text-gray-700 mb-1"
                    >
                      Plano
                    </label>
                    <Field
                      as="select"
                      name="planId"
                      id="planId"
                      required
                      className="appearance-none relative block w-full px-3 py-3 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 focus:z-10 sm:text-sm transition-colors duration-200 bg-white"
                    >
                      <option value="">Selecione um plano</option>
                      {plans.map((plan, key) => (
                        <option key={key} value={plan.id}>
                          {plan.name} - Atendentes: {plan.users} - WhatsApp:{" "}
                          {plan.connections} - Filas: {plan.queues} - R${" "}
                          {plan.amount}
                        </option>
                      ))}
                    </Field>
                  </div>
                </div>

                <div>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="group relative w-full flex justify-center py-3 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl"
                  >
                    {isSubmitting ? (
                      <div className="flex items-center">
                        <svg
                          className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                        >
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          ></circle>
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                          ></path>
                        </svg>
                        Criando conta...
                      </div>
                    ) : (
                      i18n.t("signup.buttons.submit")
                    )}
                  </button>
                </div>

                <div className="text-center">
                  <p className="text-sm text-gray-600">
                    Já possui uma conta?{" "}
                    <RouterLink
                      to="/login"
                      className="font-medium text-blue-600 hover:text-blue-500 transition-colors duration-200"
                    >
                      {i18n.t("signup.buttons.login")}
                    </RouterLink>
                  </p>
                </div>
              </Form>
            )}
          </Formik>
        </div>
      </div>
    </div>
  );
};

export default SignUp;