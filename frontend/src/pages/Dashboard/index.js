import React, { useContext, useState, useEffect } from "react";

import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import { useTheme } from "@material-ui/core/styles";
import { IconButton, Collapse, Divider } from "@mui/material";
import { Groups, SaveAlt, ExpandMore, ExpandLess } from "@mui/icons-material";

import CallIcon from "@material-ui/icons/Call";
import RecordVoiceOverIcon from "@material-ui/icons/RecordVoiceOver";
import GroupAddIcon from "@material-ui/icons/GroupAdd";
import HourglassEmptyIcon from "@material-ui/icons/HourglassEmpty";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import FilterListIcon from "@material-ui/icons/FilterList";
import ClearIcon from "@material-ui/icons/Clear";
import SendIcon from '@material-ui/icons/Send';
import MessageIcon from '@material-ui/icons/Message';
import AccessAlarmIcon from '@material-ui/icons/AccessAlarm';
import TimerIcon from '@material-ui/icons/Timer';
import * as XLSX from 'xlsx';

import { grey, blue } from "@material-ui/core/colors";
import { toast } from "react-toastify";

import TableAttendantsStatus from "../../components/Dashboard/TableAttendantsStatus";
import { isArray } from "lodash";

import { AuthContext } from "../../context/Auth/AuthContext";

import useDashboard from "../../hooks/useDashboard";
import useContacts from "../../hooks/useContacts";
import useMessages from "../../hooks/useMessages";
import { ChatsUser } from "./ChartsUser";
import ChartDonut from "./ChartDonut";

import Filters from "./Filters";
import { isEmpty } from "lodash";
import moment from "moment";
import { ChartsDate } from "./ChartsDate";
import { Avatar, Button, Card, CardContent, Container, Stack, SvgIcon, Box } from "@mui/material";
import { i18n } from "../../translate/i18n";
import Grid2 from "@mui/material/Unstable_Grid2/Grid2";
import ForbiddenPage from "../../components/ForbiddenPage";
import { ArrowDownward, ArrowUpward } from "@material-ui/icons";

const useStyles = makeStyles((theme) => ({
  root: {
    minHeight: '100vh',
    backgroundColor: theme.palette.mode === 'dark' ? '#121212' : '#f5f5f5',
    padding: theme.spacing(3),
  },
  mainTitle: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontWeight: 700,
    fontSize: '2.5rem',
    marginBottom: theme.spacing(3),
    color: theme.palette.mode === 'dark' ? '#fff' : '#333',
    textAlign: 'center',
  },
  sectionTitle: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontWeight: 600,
    fontSize: '1.5rem',
    marginBottom: theme.spacing(2),
    color: theme.palette.mode === 'dark' ? '#fff' : '#333',
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
  },
  overline: {
    fontSize: '0.85rem',
    fontWeight: 600,
    color: theme.palette.mode === 'dark' ? '#bbb' : '#666',
    letterSpacing: '0.5px',
    lineHeight: 1.5,
    textTransform: 'uppercase',
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  h4: {
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontWeight: 700,
    fontSize: '1.8rem',
    lineHeight: 1.2,
    color: theme.palette.mode === 'dark' ? '#fff' : '#333',
  },
  metricCard: {
    height: '100%',
    background: theme.palette.mode === 'dark' 
      ? 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)'
      : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
    borderRadius: '16px',
    border: theme.palette.mode === 'dark' 
      ? '1px solid #333'
      : '1px solid #e0e0e0',
    boxShadow: theme.palette.mode === 'dark'
      ? '0 8px 32px rgba(0, 0, 0, 0.3)'
      : '0 8px 32px rgba(0, 0, 0, 0.08)',
    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
    '&:hover': {
      transform: 'translateY(-4px)',
      boxShadow: theme.palette.mode === 'dark'
        ? '0 12px 40px rgba(0, 0, 0, 0.4)'
        : '0 12px 40px rgba(0, 0, 0, 0.12)',
    },
  },
  chartCard: {
    background: theme.palette.mode === 'dark' 
      ? 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)'
      : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
    borderRadius: '16px',
    border: theme.palette.mode === 'dark' 
      ? '1px solid #333'
      : '1px solid #e0e0e0',
    boxShadow: theme.palette.mode === 'dark'
      ? '0 8px 32px rgba(0, 0, 0, 0.3)'
      : '0 8px 32px rgba(0, 0, 0, 0.08)',
    padding: theme.spacing(3),
    marginBottom: theme.spacing(3),
  },
  filterCard: {
    background: theme.palette.mode === 'dark' 
      ? 'linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%)'
      : 'linear-gradient(135deg, #ffffff 0%, #f0f0f0 100%)',
    borderRadius: '16px',
    border: theme.palette.mode === 'dark' 
      ? '1px solid #444'
      : '1px solid #ddd',
    marginBottom: theme.spacing(3),
    overflow: 'hidden',
  },
  filterHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing(2, 3),
    background: theme.palette.mode === 'dark' 
      ? 'rgba(255, 255, 255, 0.05)'
      : 'rgba(0, 0, 0, 0.02)',
  },
  section: {
    marginBottom: theme.spacing(4),
  },
  npsSection: {
    background: theme.palette.mode === 'dark' 
      ? 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)'
      : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
    borderRadius: '16px',
    padding: theme.spacing(3),
    border: theme.palette.mode === 'dark' 
      ? '1px solid #333'
      : '1px solid #e0e0e0',
    boxShadow: theme.palette.mode === 'dark'
      ? '0 8px 32px rgba(0, 0, 0, 0.3)'
      : '0 8px 32px rgba(0, 0, 0, 0.08)',
  },
  attendantsSection: {
    background: theme.palette.mode === 'dark' 
      ? 'linear-gradient(135deg, #1e1e1e 0%, #2d2d2d 100%)'
      : 'linear-gradient(135deg, #ffffff 0%, #f8f9fa 100%)',
    borderRadius: '16px',
    padding: theme.spacing(3),
    border: theme.palette.mode === 'dark' 
      ? '1px solid #333'
      : '1px solid #e0e0e0',
    boxShadow: theme.palette.mode === 'dark'
      ? '0 8px 32px rgba(0, 0, 0, 0.3)'
      : '0 8px 32px rgba(0, 0, 0, 0.08)',
  },
}));

const Dashboard = () => {
  const theme = useTheme();
  const classes = useStyles();
  const [counters, setCounters] = useState({});
  const [attendants, setAttendants] = useState([]);
  const [loading, setLoading] = useState(false);
  const { find } = useDashboard();

  const [showFilter, setShowFilter] = useState(false);
  const [showNPS, setShowNPS] = useState(true);
  const [showAttendants, setShowAttendants] = useState(true);

  let newDate = new Date();
  let date = newDate.getDate();
  let month = newDate.getMonth() + 1;
  let year = newDate.getFullYear();
  let nowIni = `${year}-${month < 10 ? `0${month}` : `${month}`}-01`;
  let now = `${year}-${month < 10 ? `0${month}` : `${month}`}-${date < 10 ? `0${date}` : `${date}`}`;

  const [dateStartTicket, setDateStartTicket] = useState(nowIni);
  const [dateEndTicket, setDateEndTicket] = useState(now);
  const [queueTicket, setQueueTicket] = useState(false);
  const [fetchDataFilter, setFetchDataFilter] = useState(false);

  const { user } = useContext(AuthContext);

  const exportarGridParaExcel = () => {
    const ws = XLSX.utils.table_to_sheet(document.getElementById('grid-attendants'));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'RelatorioDeAtendentes');
    XLSX.writeFile(wb, 'relatorio-de-atendentes.xlsx');
  };

  var userQueueIds = [];

  if (user.queues && user.queues.length > 0) {
    userQueueIds = user.queues.map((q) => q.id);
  }

  useEffect(() => {
    async function firstLoad() {
      await fetchData();
    }
    setTimeout(() => {
      firstLoad();
    }, 1000);
  }, [fetchDataFilter]);

  async function fetchData() {
    setLoading(true);

    let params = {};

    if (!isEmpty(dateStartTicket) && moment(dateStartTicket).isValid()) {
      params = {
        ...params,
        date_from: moment(dateStartTicket).format("YYYY-MM-DD"),
      };
    }

    if (!isEmpty(dateEndTicket) && moment(dateEndTicket).isValid()) {
      params = {
        ...params,
        date_to: moment(dateEndTicket).format("YYYY-MM-DD"),
      };
    }

    if (Object.keys(params).length === 0) {
      toast.error("Parametrize o filtro");
      setLoading(false);
      return;
    }

    const data = await find(params);

    setCounters(data.counters);
    if (isArray(data.attendants)) {
      setAttendants(data.attendants);
    } else {
      setAttendants([]);
    }

    setLoading(false);
  }

  function formatTime(minutes) {
    return moment()
      .startOf("day")
      .add(minutes, "minutes")
      .format("HH[h] mm[m]");
  }

  const GetUsers = () => {
    let count;
    let userOnline = 0;
    attendants.forEach(user => {
      if (user.online === true) {
        userOnline = userOnline + 1
      }
    })
    count = userOnline === 0 ? 0 : userOnline;
    return count;
  };

  const GetContacts = (all) => {
    let props = {};
    if (all) {
      props = {};
    } else {
      props = {
        dateStart: dateStartTicket,
        dateEnd: dateEndTicket,
      };
    }
    const { count } = useContacts(props);
    return count;
  };

  const GetMessages = (all, fromMe) => {
    let props = {};
    if (all) {
      if (fromMe) {
        props = {
          fromMe: true
        };
      } else {
        props = {
          fromMe: false
        };
      }
    } else {
      if (fromMe) {
        props = {
          fromMe: true,
          dateStart: dateStartTicket,
          dateEnd: dateEndTicket,
        };
      } else {
        props = {
          fromMe: false,
          dateStart: dateStartTicket,
          dateEnd: dateEndTicket,
        };
      }
    }
    const { count } = useMessages(props);
    return count;
  };

  function toggleShowFilter() {
    setShowFilter(!showFilter);
  }

  const metricsData = [
    {
      title: i18n.t("dashboard.cards.inAttendance"),
      value: counters.supportHappening,
      icon: CallIcon,
      color: '#0b708c'
    },
    {
      title: i18n.t("dashboard.cards.waiting"),
      value: counters.supportPending,
      icon: HourglassEmptyIcon,
      color: '#47606e'
    },
    {
      title: i18n.t("dashboard.cards.finalized"),
      value: counters.supportFinished,
      icon: CheckCircleIcon,
      color: '#5852ab'
    },
    {
      title: i18n.t("dashboard.cards.groups"),
      value: counters.supportGroups,
      icon: Groups,
      color: '#01BBAC'
    },
    {
      title: i18n.t("dashboard.cards.activeAttendants"),
      value: `${GetUsers()}/${attendants.length}`,
      icon: RecordVoiceOverIcon,
      color: '#805753'
    },
    {
      title: i18n.t("dashboard.cards.newContacts"),
      value: counters.leads,
      icon: GroupAddIcon,
      color: '#8c6b19'
    },
    {
      title: i18n.t("dashboard.cards.totalReceivedMessages"),
      value: `${GetMessages(false, false)}/${GetMessages(true, false)}`,
      icon: MessageIcon,
      color: '#333133'
    },
    {
      title: i18n.t("dashboard.cards.totalSentMessages"),
      value: `${GetMessages(false, true)}/${GetMessages(true, true)}`,
      icon: SendIcon,
      color: '#558a59'
    },
    {
      title: i18n.t("dashboard.cards.averageServiceTime"),
      value: formatTime(counters.avgSupportTime),
      icon: AccessAlarmIcon,
      color: '#F79009'
    },
    {
      title: i18n.t("dashboard.cards.averageWaitingTime"),
      value: formatTime(counters.avgWaitTime),
      icon: TimerIcon,
      color: '#8a2c40'
    },
    {
      title: i18n.t("dashboard.cards.activeTickets"),
      value: counters.activeTickets,
      icon: ArrowUpward,
      color: '#EE4512'
    },
    {
      title: i18n.t("dashboard.cards.passiveTickets"),
      value: counters.passiveTickets,
      icon: ArrowDownward,
      color: '#28C037'
    }
  ];

  return (
    <>
      {
        user.profile === "user" && user.showDashboard === "disabled" ?
          <ForbiddenPage />
          :
          <Box className={classes.root}>
            <Container maxWidth="xl">
              
              {/* Título Principal */}
              <Typography className={classes.mainTitle}>
                Dashboard de Atendimento
              </Typography>

              {/* Filtros */}
              <Card className={classes.filterCard}>
                <Box className={classes.filterHeader}>
                  <Typography className={classes.sectionTitle}>
                    <FilterListIcon />
                    Filtros
                  </Typography>
                  <IconButton onClick={toggleShowFilter} color="primary">
                    {showFilter ? <ExpandLess /> : <ExpandMore />}
                  </IconButton>
                </Box>
                <Collapse in={showFilter}>
                  <Box sx={{ p: 3 }}>
                    <Filters
                      classes={classes}
                      setDateStartTicket={setDateStartTicket}
                      setDateEndTicket={setDateEndTicket}
                      dateStartTicket={dateStartTicket}
                      dateEndTicket={dateEndTicket}
                      setQueueTicket={setQueueTicket}
                      queueTicket={queueTicket}
                      fetchData={setFetchDataFilter}
                    />
                  </Box>
                </Collapse>
              </Card>

              {/* Métricas Principais */}
              <Box className={classes.section}>
                <Typography className={classes.sectionTitle}>
                  📊 Indicadores Principais
                </Typography>
                <Grid2 container spacing={3}>
                  {metricsData.map((metric, index) => (
                    <Grid2 xs={12} sm={6} md={4} lg={3} key={index}>
                      <Card className={classes.metricCard}>
                        <CardContent>
                          <Stack
                            alignItems="flex-start"
                            direction="row"
                            justifyContent="space-between"
                            spacing={3}
                          >
                            <Stack spacing={1}>
                              <Typography
                                variant="overline"
                                className={classes.overline}
                              >
                                {metric.title}
                              </Typography>
                              <Typography variant="h4" className={classes.h4}>
                                {metric.value}
                              </Typography>
                            </Stack>
                            <Avatar
                              sx={{
                                backgroundColor: metric.color,
                                height: 56,
                                width: 56
                              }}
                            >
                              <SvgIcon>
                                <metric.icon />
                              </SvgIcon>
                            </Avatar>
                          </Stack>
                        </CardContent>
                      </Card>
                    </Grid2>
                  ))}
                </Grid2>
              </Box>

              {/* Seção NPS */}
              <Box className={classes.section}>
  <Box className={classes.filterHeader}>
    <Typography className={classes.sectionTitle}>
      📈 Avaliações (NPS)
    </Typography>
    <IconButton onClick={() => setShowNPS(!showNPS)} color="primary">
      {showNPS ? <ExpandLess /> : <ExpandMore />}
    </IconButton>
  </Box>
  <Collapse in={showNPS}>
    <Box className={classes.npsSection}>
      <Grid2 container spacing={3}>
        <Grid2 xs={12} sm={6} md={3}>
          <Box>
            <ChartDonut
              data={[
                `{'name': 'Promotores', 'value': ${counters.npsPromotersPerc | 100}}`,
                `{'name': 'Detratores', 'value': ${counters.npsDetractorsPerc | 0}}`,
                `{'name': 'Neutros', 'value': ${counters.npsPassivePerc | 0}}`
              ]}
              value={counters.npsScore | 0}
              title="Score"
              color={(parseInt(counters.npsPromotersPerc | 0) + parseInt(counters.npsDetractorsPerc | 0) + parseInt(counters.npsPassivePerc | 0)) === 0 ? ["#918F94"] : ["#2EA85A", "#F73A2C", "#F7EC2C"]}
            />
          </Box>
        </Grid2>

        <Grid2 xs={12} sm={6} md={3}>
          <Box>
            <ChartDonut
              title={i18n.t("dashboard.assessments.prosecutors")}
              value={counters.npsPromotersPerc | 0}
              data={[`{'name': 'Promotores', 'value': 100}`]}
              color={["#2EA85A"]}
            />
          </Box>
        </Grid2>

        <Grid2 xs={12} sm={6} md={3}>
          <Box>
            <ChartDonut
              data={[`{'name': 'Neutros', 'value': 100}`]}
              title={i18n.t("dashboard.assessments.neutral")}
              value={counters.npsPassivePerc | 0}
              color={["#F7EC2C"]}
            />
          </Box>
        </Grid2>

        <Grid2 xs={12} sm={6} md={3}>
          <Box>
            <ChartDonut
              data={[`{'name': 'Detratores', 'value': 100}`]}
              title={i18n.t("dashboard.assessments.detractors")}
              value={counters.npsDetractorsPerc | 0}
              color={["#F73A2C"]}
            />
          </Box>
        </Grid2>
      </Grid2>
    </Box>
  </Collapse>
</Box>

              {/* Seção Atendentes */}
              <Box className={classes.section}>
                <Card className={classes.filterCard}>
                  <Box className={classes.filterHeader}>
                    <Typography className={classes.sectionTitle}>
                      👥 Relatório de Atendentes
                    </Typography>
                    <Stack direction="row" spacing={1} alignItems="center">
                      <IconButton onClick={exportarGridParaExcel} color="primary">
                        <SaveAlt />
                      </IconButton>
                      <IconButton onClick={() => setShowAttendants(!showAttendants)} color="primary">
                        {showAttendants ? <ExpandLess /> : <ExpandMore />}
                      </IconButton>
                    </Stack>
                  </Box>
                  <Collapse in={showAttendants}>
                    <Box className={classes.attendantsSection}>
                      <Grid2 container spacing={3}>
                        <Grid2 xs={12} id="grid-attendants">
                          {attendants.length ? (
                            <TableAttendantsStatus
                              attendants={attendants}
                              loading={loading}
                            />
                          ) : null}
                        </Grid2>

                        <Grid2 xs={12} md={6}>
                          <Card className={classes.chartCard}>
                            <Typography className={classes.sectionTitle} variant="h6" gutterBottom>
                              Atendimentos por Usuário
                            </Typography>
                            <ChatsUser />
                          </Card>
                        </Grid2>

                        <Grid2 xs={12} md={6}>
                          <Card className={classes.chartCard}>
                            <Typography className={classes.sectionTitle} variant="h6" gutterBottom>
                              Atendimentos por Data
                            </Typography>
                            <ChartsDate />
                          </Card>
                        </Grid2>
                      </Grid2>
                    </Box>
                  </Collapse>
                </Card>
              </Box>

            </Container>
          </Box>
      }
    </>
  );
};

export default Dashboard;