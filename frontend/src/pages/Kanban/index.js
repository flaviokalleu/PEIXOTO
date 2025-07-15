import React, { useState, useEffect, useContext } from "react";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";
import Board from 'react-trello';
import { toast } from "react-toastify";
import { i18n } from "../../translate/i18n";
import { useHistory } from 'react-router-dom';
import { Search, Plus, Calendar, MessageCircle } from "lucide-react";
import { format, isSameDay, parseISO } from "date-fns";
import { Can } from "../../components/Can";

const Kanban = () => {
  const history = useHistory();
  const { user, socket } = useContext(AuthContext);
  const [tags, setTags] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [ticketNot, setTicketNot] = useState(0);
  const [file, setFile] = useState({ lanes: [] });
  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const jsonString = user.queues.map(queue => queue.UserQueue.queueId);

  useEffect(() => {
    fetchTags();
  }, [user]);

  const fetchTags = async () => {
    try {
      const response = await api.get("/tag/kanban/");
      const fetchedTags = response.data.lista || [];
      setTags(fetchedTags);
      fetchTickets();
    } catch (error) {
      console.log(error);
    }
  };

  const fetchTickets = async () => {
    try {
      const { data } = await api.get("/ticket/kanban", {
        params: {
          queueIds: JSON.stringify(jsonString),
          startDate: startDate,
          endDate: endDate,
        }
      });
      setTickets(data.tickets);
    } catch (err) {
      console.log(err);
      setTickets([]);
    }
  };

  useEffect(() => {
    const companyId = user.companyId;
    const onAppMessage = (data) => {
      if (data.action === "create" || data.action === "update" || data.action === "delete") {
        fetchTickets();
      }
    };
    socket.on(`company-${companyId}-ticket`, onAppMessage);
    socket.on(`company-${companyId}-appMessage`, onAppMessage);

    return () => {
      socket.off(`company-${companyId}-ticket`, onAppMessage);
      socket.off(`company-${companyId}-appMessage`, onAppMessage);
    };
  }, [socket, startDate, endDate]);

  const handleSearchClick = () => {
    fetchTickets();
  };

  const handleStartDateChange = (event) => {
    setStartDate(event.target.value);
  };

  const handleEndDateChange = (event) => {
    setEndDate(event.target.value);
  };

  const IconChannel = (channel) => {
    const iconProps = { size: 16, className: "inline align-middle" };
    
    switch (channel) {
      case "facebook":
        return <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center">
          <span className=" text-xs font-bold">f</span>
        </div>;
      case "instagram":
        return <div className="w-4 h-4 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
          <span className=" text-xs font-bold">i</span>
        </div>;
      case "whatsapp":
        return <MessageCircle {...iconProps} className="inline align-middle text-green-500" />
      default:
        return <span className="text-red-500 text-xs">error</span>;
    }
  };

  const popularCards = (jsonString) => {
    const filteredTickets = tickets.filter(ticket => ticket.tags.length === 0);

    const lanes = [
      {
        id: "lane0",
        title: i18n.t("tagsKanban.laneDefault"),
        label: filteredTickets.length.toString(),
        cards: filteredTickets.map(ticket => ({
          id: ticket.id.toString(),
          label: "Ticket nº " + ticket.id.toString(),
          laneId: "lane0",
          description: (
            <div className="space-y-3">
              <div className="flex justify-between items-start">
                <span className="text-sm font-medium text-gray-700">{ticket.contact.number}</span>
                <span className={`text-xs ${Number(ticket.unreadMessages) > 0 
                  ? 'text-green-600 font-semibold' 
                  : 'text-gray-500'
                }`}>
                  {isSameDay(parseISO(ticket.updatedAt), new Date()) ? (
                    format(parseISO(ticket.updatedAt), "HH:mm")
                  ) : (
                    format(parseISO(ticket.updatedAt), "dd/MM/yyyy")
                  )}
                </span>
              </div>
              
              <div className="text-left text-sm text-gray-600 line-clamp-2">
                {ticket.lastMessage || " "}
              </div>
              
              <div className="flex items-center justify-between pt-2">
                <button
                  onClick={() => handleCardClick(ticket.uuid)}
                  className="bg-blue-600 hover:bg-blue-700  text-xs font-medium px-3 py-1.5 rounded-lg transition-colors duration-200 shadow-sm"
                >
                  Ver Ticket
                </button>
                
                {ticket?.user && (
                  <span className=" text-xs font-bold px-2 py-1 rounded uppercase">
                    {ticket.user?.name}
                  </span>
                )}
              </div>
            </div>
          ),
          title: (
            <div className="flex items-center space-x-2" key={`title-${ticket.id}`}>
              <div className="relative group">
                {IconChannel(ticket.channel)}
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900  text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                  {ticket.whatsapp?.name}
                </div>
              </div>
              <span className="font-medium text-gray-800">{ticket.contact.name}</span>
            </div>
          ),
          draggable: true,
          href: "/tickets/" + ticket.uuid,
        })),
      },
      ...tags.map(tag => {
        const filteredTickets = tickets.filter(ticket => {
          const tagIds = ticket.tags.map(tag => tag.id);
          return tagIds.includes(tag.id);
        });

        return {
          id: tag.id.toString(),
          title: tag.name,
          label: filteredTickets?.length.toString(),
          cards: filteredTickets.map(ticket => ({
            id: ticket.id.toString(),
            label: "Ticket nº " + ticket.id.toString(),
            laneId: tag.id.toString(),
            description: (
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="text-sm font-medium ">
                    {ticket.contact.number}
                  </div>
                  <div className="text-sm /90 line-clamp-2">
                    {ticket.lastMessage || " "}
                  </div>
                </div>
                
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={() => handleCardClick(ticket.uuid)}
                    className="/20 hover:/30  text-xs font-medium px-3 py-1.5 rounded-lg transition-colors duration-200 backdrop-blur-sm"
                  >
                    Ver Ticket
                  </button>
                  
                  {ticket?.user && (
                    <span className="bg-black/50  text-xs font-bold px-2 py-1 rounded uppercase backdrop-blur-sm">
                      {ticket.user?.name}
                    </span>
                  )}
                </div>
              </div>
            ),
            title: (
              <div className="flex items-center space-x-2" key={`title-tag-${ticket.id}`}>
                <div className="relative group">
                  {IconChannel(ticket.channel)}
                  <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-gray-900  text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity duration-200 whitespace-nowrap z-10">
                    {ticket.whatsapp?.name}
                  </div>
                </div>
                <span className="font-medium ">{ticket.contact.name}</span>
              </div>
            ),
            draggable: true,
            href: "/tickets/" + ticket.uuid,
          })),
          style: { backgroundColor: tag.color, color: "white" }
        };
      }),
    ];

    setFile({ lanes });
  };

  const handleCardClick = (uuid) => {
    history.push('/tickets/' + uuid);
  };

  useEffect(() => {
    popularCards(jsonString);
  }, [tags, tickets]);

  const handleCardMove = async (cardId, sourceLaneId, targetLaneId) => {
    try {
      await api.delete(`/ticket-tags/${targetLaneId}`);
      toast.success('Ticket Tag Removido!');
      await api.put(`/ticket-tags/${targetLaneId}/${sourceLaneId}`);
      toast.success('Ticket Tag Adicionado com Sucesso!');
      await fetchTickets(jsonString);
      popularCards(jsonString);
    } catch (err) {
      console.log(err);
    }
  };

  const handleAddConnectionClick = () => {
    history.push('/tagsKanban');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className=" rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            {/* Date Filters */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-center space-x-3">
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="date"
                    value={startDate}
                    onChange={handleStartDateChange}
                    className="pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium transition-all duration-200"
                    placeholder="Data de início"
                  />
                </div>
                
                <span className="text-gray-400 font-medium">até</span>
                
                <div className="relative">
                  <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                  <input
                    type="date"
                    value={endDate}
                    onChange={handleEndDateChange}
                    className="pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm font-medium transition-all duration-200"
                    placeholder="Data de fim"
                  />
                </div>
              </div>
              
              <button
                onClick={handleSearchClick}
                className="flex items-center space-x-2 bg-blue-600 hover:bg-blue-700  px-4 py-2.5 rounded-lg font-medium transition-colors duration-200 shadow-sm hover:shadow-md"
              >
                <Search size={16} />
                <span>Buscar</span>
              </button>
            </div>

            {/* Add Columns Button */}
            <Can 
              role={user.profile} 
              perform="dashboard:view" 
              yes={() => (
                <button
                  onClick={handleAddConnectionClick}
                  className="flex items-center space-x-2 bg-emerald-600 hover:bg-emerald-700  px-4 py-2.5 rounded-lg font-medium transition-colors duration-200 shadow-sm hover:shadow-md"
                >
                  <Plus size={16} />
                  <span>Adicionar Colunas</span>
                </button>
              )} 
            />
          </div>
        </div>

        {/* Kanban Board */}
        <div className="">
          <Board
            data={file}
            onCardMoveAcrossLanes={handleCardMove}
            style={{ 
              backgroundColor: 'transparent',
              fontFamily: 'Inter, system-ui, sans-serif'
            }}
            laneStyle={{
              backgroundColor: '#f8fafc',
              borderRadius: '12px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
              margin: '0 8px'
            }}
            cardStyle={{
              
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
              marginBottom: '12px',
              padding: '16px'
            }}
          />
        </div>
      </div>
      
      {/* Custom CSS for additional styling */}
      <style jsx>{`
        .line-clamp-2 {
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        
        /* Custom scrollbar */
        ::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        
        ::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 3px;
        }
        
        ::-webkit-scrollbar-thumb {
          background: #cbd5e1;
          border-radius: 3px;
        }
        
        ::-webkit-scrollbar-thumb:hover {
          background: #94a3b8;
        }
      `}</style>
    </div>
  );
};

export default Kanban;