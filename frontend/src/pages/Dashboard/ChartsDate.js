import React, { useEffect, useState, useContext } from 'react';
import {
  Chart as ChartJS,
  RadialLinearScale,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';
import { PolarArea } from 'react-chartjs-2';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import {
  Box,
  Button,
  Card,
  CardContent,
  Grid,
  TextField,
  Typography,
  useTheme
} from '@mui/material';
import brLocale from 'date-fns/locale/pt-BR';
import { format } from 'date-fns';
import { toast } from 'react-toastify';
import api from '../../services/api';
import { i18n } from '../../translate/i18n';
import { AuthContext } from '../../context/Auth/AuthContext';

ChartJS.register(RadialLinearScale, ArcElement, Tooltip, Legend);

export const ChartsDate = () => {
  const theme = useTheme();
  const [initialDate, setInitialDate] = useState(new Date());
  const [finalDate, setFinalDate] = useState(new Date());
  const [ticketsData, setTicketsData] = useState({ data: [], count: 0 });
  const { user } = useContext(AuthContext);
  const companyId = user.companyId;

  useEffect(() => {
    if (companyId) handleGetTicketsInformation();
  }, [companyId]);

  const handleGetTicketsInformation = async () => {
    try {
      const { data } = await api.get(
        `/dashboard/ticketsDay?initialDate=${format(
          initialDate,
          'yyyy-MM-dd'
        )}&finalDate=${format(finalDate, 'yyyy-MM-dd')}&companyId=${companyId}`
      );
      setTicketsData(data);
    } catch (error) {
      toast.error('Erro ao buscar informações dos tickets');
    }
  };

  const chartData = {
    labels: ticketsData?.data.map((item) =>
      item.horario ? `Das ${item.horario}:00 às ${item.horario}:59` : item.data
    ),
    datasets: [
      {
        label: 'Tickets',
        data: ticketsData?.data.map((item) => item.total),
        backgroundColor: ticketsData?.data.map(
          (_, i) =>
            `hsl(${(i * 360) / (ticketsData.data.length || 1)}, 70%, 60%)`
        ),
        borderWidth: 1
      }
    ]
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          color: theme.palette.text.primary
        }
      },
      tooltip: {
        enabled: true
      }
    }
  };

  return (
    <Card elevation={3} sx={{ borderRadius: 4, p: 2 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom color="primary">
          {i18n.t('dashboard.users.totalAttendances')} ({ticketsData?.count})
        </Typography>

        <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={brLocale}>
          <Grid container spacing={2} alignItems="center" mb={3}>
            <Grid item xs={12} sm={4}>
              <DatePicker
                label={i18n.t('dashboard.date.initialDate')}
                value={initialDate}
                onChange={(newValue) => setInitialDate(newValue)}
                renderInput={(params) => <TextField {...params} fullWidth size="small" />}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <DatePicker
                label={i18n.t('dashboard.date.finalDate')}
                value={finalDate}
                onChange={(newValue) => setFinalDate(newValue)}
                renderInput={(params) => <TextField {...params} fullWidth size="small" />}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <Button
                onClick={handleGetTicketsInformation}
                variant="contained"
                color="primary"
                sx={{
                  height: '40px',
                  borderRadius: 2,
                  px: 4,
                  mt: { xs: 1, sm: 0 },
                }}
                fullWidth
              >
                Filtrar
              </Button>
            </Grid>
          </Grid>
        </LocalizationProvider>

        <Box sx={{ maxWidth: 600, mx: 'auto' }}>
          <PolarArea data={chartData} options={chartOptions} />
        </Box>
      </CardContent>
    </Card>
  );
};
