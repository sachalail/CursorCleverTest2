import { useEffect, useState, useRef } from 'react'
import { supabase } from './supabase'

function Conversation({ conversationId, userId, onBack, onConversationUpdate }) {
  const [messages, setMessages] = useState([])
  const [participants, setParticipants] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [usernames, setUsernames] = useState({})
  const [conversationDetails, setConversationDetails] = useState(null)
  const [isRenaming, setIsRenaming] = useState(false)
  const [newName, setNewName] = useState('')
  const [tempName, setTempName] = useState('')
  const [lastReadMessageId, setLastReadMessageId] = useState(null)
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false)
  const messagesEndRef = useRef(null)
  const lastConnection = useRef(localStorage.getItem(`lastConnection_${userId}`) || new Date().toISOString())

  // Fonction pour marquer les messages comme lus
  const markMessagesAsRead = () => {
    if (messages.length > 0) {
      const lastMessageId = messages[messages.length - 1].id
      localStorage.setItem(`lastRead_${conversationId}_${userId}`, lastMessageId)
      setLastReadMessageId(lastMessageId)
    }
  }

  // Effet pour marquer les messages comme lus lors du démontage du composant
  useEffect(() => {
    return () => {
      markMessagesAsRead()
    }
  }, [messages])

  const isMessageUnread = (message) => {
    if (!lastReadMessageId || message.sender_id === userId) return false
    // Si l'ID du message est supérieur à celui du dernier message lu, il est non lu
    return message.id > lastReadMessageId
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  useEffect(() => {
    const handleScroll = () => {
      const container = messagesEndRef.current?.parentElement
      if (container) {
        const isAtBottom = container.scrollHeight - container.scrollTop === container.clientHeight
        if (isAtBottom && messages.length > 0) {
          markMessagesAsRead()
        }
      }
    }

    const container = messagesEndRef.current?.parentElement
    if (container) {
      container.addEventListener('scroll', handleScroll)
      return () => container.removeEventListener('scroll', handleScroll)
    }
  }, [messages, conversationId, userId])

  const fetchMessages = async () => {
    try {
      const { data: messagesData, error: messagesError } = await supabase
        .from('messages')
        .select('*')
        .eq('conversation_id', conversationId)
        .order('timestamp', { ascending: true })

      if (messagesError) throw messagesError
      setMessages(messagesData || [])
    } catch (error) {
      console.error('Erreur lors du chargement des messages:', error)
    }
  }

  useEffect(() => {
    const fetchConversationData = async () => {
      try {
        // Récupérer les participants
        const { data: convData, error: convError } = await supabase
          .from('conversations')
          .select('id, is_group, name, created_by')
          .eq('id', conversationId)
          .single()

        if (convError) throw convError

        console.log('Données de la conversation:', convData)
        setConversationDetails(convData)
        setTempName(convData?.name || 'Notes personnelles')

        // Récupérer les messages
        await fetchMessages()

        // Récupérer les participants
        const { data: participantsData, error: participantsError } = await supabase
          .from('conversation_participants')
          .select('user_id')
          .eq('conversation_id', conversationId)

        if (participantsError) throw participantsError

        const participantIds = participantsData.map(p => p.user_id)
        setParticipants(participantIds)

        // Récupérer les usernames
        const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, username')
          .in('id', participantIds)

        if (usersError) throw usersError

        const usernameMap = {}
        usersData.forEach(user => {
          usernameMap[user.id] = user.username
        })
        setUsernames(usernameMap)

        // Récupérer le dernier message lu
        const lastRead = localStorage.getItem(`lastRead_${conversationId}_${userId}`)
        setLastReadMessageId(lastRead)
      } catch (error) {
        console.error('Erreur lors du chargement de la conversation:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchConversationData()

    // S'abonner aux nouveaux messages
    const channel = supabase
      .channel(`conversation:${conversationId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${typeof conversationId === 'string' ? `'${conversationId}'` : conversationId}`
      }, (payload) => {
        console.log('Nouveau message reçu:', payload.new)
        setMessages(prev => {
          const newMessages = [...prev, payload.new]
          // Trier les messages par timestamp
          return newMessages.sort((a, b) => 
            new Date(a.timestamp) - new Date(b.timestamp)
          )
        })
      })
      .subscribe()

    return () => {
      console.log('Désabonnement du canal')
      supabase.removeChannel(channel)
    }
  }, [conversationId])

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim()) return

    console.log('Tentative d\'envoi de message:', {
      conversationId,
      userId,
      content: newMessage.trim()
    })

    try {
      const { data, error } = await supabase
        .from('messages')
        .insert([
          {
            conversation_id: conversationId,
            sender_id: userId,
            content: newMessage.trim(),
            timestamp: new Date().toISOString()
          }
        ])
        .select()

      if (error) throw error

      console.log('Message envoyé avec succès:', data)
      setNewMessage('')
      // Recharger les messages après l'envoi
      await fetchMessages()
    } catch (error) {
      console.error('Erreur lors de l\'envoi du message:', error)
    }
  }

  const handleRename = async (e) => {
    e.preventDefault()
    if (!newName.trim() || !conversationDetails) return

    try {
      // Mettre à jour le nom dans la base de données
      const { error } = await supabase
        .from('conversations')
        .update({ name: newName.trim() })
        .eq('id', conversationId)

      if (error) throw error

      // Mettre à jour l'état local
      setConversationDetails({
        ...conversationDetails,
        name: newName.trim()
      })
      setTempName(newName.trim())
      setIsRenaming(false)
      
      // Notifier le composant parent du changement
      if (onConversationUpdate) {
        onConversationUpdate(conversationId, newName.trim())
      }
    } catch (error) {
      console.error('Erreur lors du renommage de la conversation:', error)
    }
  }

  if (loading) {
    return <div style={{ padding: '1rem', textAlign: 'center' }}>Chargement...</div>
  }

  return (
    <div style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      height: '100vh',
      backgroundColor: '#36393f',
      fontFamily: 'Whitney, "Helvetica Neue", Helvetica, Arial, sans-serif'
    }}>
      {/* En-tête */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center',
        padding: '1rem',
        backgroundColor: '#2f3136',
        borderBottom: '1px solid #202225',
        color: '#dcddde'
      }}>
        <button
          onClick={onBack}
          style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#5865f2',
            color: '#ffffff',
            border: 'none',
            cursor: 'pointer',
            marginRight: '1rem',
            borderRadius: '4px',
            fontWeight: '500',
            transition: 'all 0.2s ease'
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4752c4'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#5865f2'}
        >
          ← Retour
        </button>

        {isRenaming ? (
          <form onSubmit={handleRename} style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            flex: 1
          }}>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              autoFocus
              style={{
                flex: 1,
                padding: '0.5rem',
                backgroundColor: '#40444b',
                border: 'none',
                borderRadius: '4px',
                color: '#dcddde',
                fontSize: '1rem'
              }}
            />
            <button
              type="submit"
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#5865f2',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Enregistrer
            </button>
            <button
              type="button"
              onClick={() => {
                setIsRenaming(false)
                setNewName(tempName)
              }}
              style={{
                padding: '0.5rem 1rem',
                backgroundColor: '#ed4245',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Annuler
            </button>
          </form>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            flex: 1
          }}>
            <h2 style={{ 
              margin: 0, 
              fontSize: '1.2rem',
              fontWeight: '500'
            }}>
              {tempName}
            </h2>
            {conversationDetails?.created_by === userId && (
              <button
                onClick={() => {
                  setIsRenaming(true)
                  setNewName(tempName)
                }}
                style={{
                  padding: '0.5rem',
                  backgroundColor: 'transparent',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#b9bbbe',
                  fontSize: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem'
                }}
                onMouseOver={(e) => e.currentTarget.style.color = '#ffffff'}
                onMouseOut={(e) => e.currentTarget.style.color = '#b9bbbe'}
              >
                <span style={{ fontSize: '0.8rem' }}>✏️</span>
                Renommer
              </button>
            )}
          </div>
        )}
      </div>

      {/* Zone des messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '2rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
      }}>
        {messages.length === 0 ? (
          <div style={{ 
            textAlign: 'center', 
            color: '#dcddde',
            marginTop: '2rem',
            fontSize: '1.2rem'
          }}>
            Aucun message dans cette conversation
          </div>
        ) : (
          <>
            {messages.map((message, index) => {
              const isCurrentUser = message.sender_id === userId
              const isUnread = isMessageUnread(message)

              return (
                <div key={message.id}>
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.5rem',
                      padding: '1rem',
                      backgroundColor: '#40444b',
                      borderRadius: '4px',
                      maxWidth: '80%',
                      marginLeft: isCurrentUser ? 'auto' : '0',
                      marginRight: isCurrentUser ? '0' : 'auto',
                      borderLeft: isUnread ? '4px solid #faa61a' : 'none'
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <span style={{
                        color: '#ffffff',
                        fontWeight: '500'
                      }}>
                        {usernames[message.sender_id]}
                      </span>
                      <span style={{
                        color: '#72767d',
                        fontSize: '0.8rem'
                      }}>
                        {new Date(message.timestamp).toLocaleString()}
                      </span>
                    </div>
                    <div style={{
                      color: isUnread ? '#faa61a' : '#dcddde'
                    }}>
                      {message.content}
                    </div>
                  </div>
                </div>
              )
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Zone de saisie */}
      <div style={{
        padding: '1rem',
        backgroundColor: '#2f3136',
        borderTop: '1px solid #202225'
      }}>
        <form onSubmit={handleSendMessage} style={{ 
          display: 'flex', 
          gap: '1rem'
        }}>
          <input
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Écrivez votre message..."
            style={{
              flex: 1,
              padding: '0.75rem',
              backgroundColor: '#40444b',
              border: 'none',
              borderRadius: '4px',
              color: '#dcddde',
              fontSize: '0.9rem'
            }}
          />
          <button
            type="submit"
            style={{
              padding: '0.75rem 1.5rem',
              backgroundColor: '#5865f2',
              color: '#ffffff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: '500',
              transition: 'all 0.2s ease'
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4752c4'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#5865f2'}
          >
            Envoyer
          </button>
        </form>
      </div>
    </div>
  )
}

export default Conversation 