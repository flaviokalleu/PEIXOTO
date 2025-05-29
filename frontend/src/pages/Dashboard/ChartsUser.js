import React, { useEffect, useState, useContext } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js';
import { Chart } from 'react-chartjs-2';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import brLocale from 'date-fns/locale/pt-BR';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { Button, Grid, TextField, Typography } from '@material-ui/core';
import { makeStyles, useTheme } from '@material-ui/core/styles';
import api from '../../services/api';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import { i18n } from '../../translate/i18n';
import { AuthContext } from '../../context/Auth/AuthContext';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

const useStyles = makeStyles((theme) => ({
  container: {
    padding: theme.spacing(2),
  }
}));

const options = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      position: 'top',
      labels: {
        font: {
          size: 13
        }
      }
    },
    title: {
      display: true,
      text: 'Distribuição de Atendimentos por Usuário',
      font: {
        size: 18
      }
    }
  },
  scales: {
    x: {
      ticks: {
        color: '#555',
        font: {
          size: 12
        }
      }
    },
    y: {
      beginAtZero: true,
      ticks: {
        color: '#555',
        font: {
          size: 12
        }
      }
    }
  }
};

export const ChatsUser = () => {
  const classes = useStyles();
  const theme = useTheme();
  const [initialDate, setInitialDate] = useState(new Date());
  const [finalDate, setFinalDate] = useState(new Date());
  const [ticketsData, setTicketsData] = useState({ data: [] });
  const { user } = useContext(AuthContext);

  const companyId = user.companyId;

  useEffect(() => {
    if (companyId) {
      handleGetTicketsInformation();
    }
  }, [companyId]);

  const data = {
    labels: ticketsData?.data.map((item) => item.nome),
    datasets: [
      {
        type: 'bar',
        label: 'Total de Tickets',
        data: ticketsData?.data.map((item) => item.quantidade),
        backgroundColor: theme.palette.primary.main,
        borderRadius: 6,
        barThickness: 30
      },
      {
        type: 'line',
        label: 'Tendência',
        data: ticketsData?.data.map((item) => item.quantidade),
        borderColor: theme.palette.secondary.main,
        backgroundColor: theme.palette.secondary.main,
        fill: false,
        tension: 0.4,
        pointRadius: 5
      }
    ]
  };

  const handleGetTicketsInformation = async () => {
    try {
      const { data } = await api.get(`/dashboard/ticketsUsers?initialDate=${format(initialDate, 'yyyy-MM-dd')}&finalDate=${format(finalDate, 'yyyy-MM-dd')}&companyId=${companyId}`);
      setTicketsData(data);
    } catch (error) {
      toast.error('Erro ao buscar informações dos tickets');
    }
  };

  return (
    <>
      <Typography component="h2" variant="h6" color="primary" gutterBottom>
        {i18n.t("dashboard.users.totalCallsUser")}
      </Typography>

      <Grid container spacing={2}>
        <Grid item>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={brLocale}>
            <DatePicker
              value={initialDate}
              onChange={(newValue) => setInitialDate(newValue)}
              label={i18n.t("dashboard.date.initialDate")}
              renderInput={(params) => <TextField fullWidth {...params} sx={{ width: '20ch' }} />}
            />
          </LocalizationProvider>
        </Grid>
        <Grid item>
          <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={brLocale}>
            <DatePicker
              value={finalDate}
              onChange={(newValue) => setFinalDate(newValue)}
              label={i18n.t("dashboard.date.finalDate")}
              renderInput={(params) => <TextField fullWidth {...params} sx={{ width: '20ch' }} />}
            />
          </LocalizationProvider>
        </Grid>
        <Grid item>
          <Button
            style={{ backgroundColor: theme.palette.primary.main, top: '10px' }}
            onClick={handleGetTicketsInformation}
            variant='contained'
          >
            Filtrar
          </Button>
        </Grid>
      </Grid>

      <div style={{ width: '100%', height: '400px', marginTop: '20px' }}>
        <Chart type='bar' options={options} data={data} />
      </div>
    </>
  );
};
