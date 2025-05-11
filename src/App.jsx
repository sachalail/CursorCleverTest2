import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import Login from './Login'
import Conversation from './Conversation'

function App() {
  const [user, setUser] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState(null)
  const [userConversations, setUserConversations] = useState([])
  const [openedConversationId, setOpenedConversationId] = useState(null)
  const [friends, setFriends] = useState([])
  const [favorites, setFavorites] = useState([])
  const [conversationNames, setConversationNames] = useState({})
  const [lastConnection, setLastConnection] = useState(null)
  const [recentMessages, setRecentMessages] = useState([])

  useEffect(() => {
    if (user) {
      fetchFriends()
      // Récupérer la dernière connexion depuis le localStorage avec un décalage d'une seconde
      const savedLastConnection = localStorage.getItem(`lastConnection_${user.id}`)
      const lastConnectionDate = savedLastConnection 
        ? new Date(new Date(savedLastConnection).getTime() - 1000) // Soustraire 1 seconde
        : new Date(Date.now() - 1000) // Pour la première connexion
      setLastConnection(lastConnectionDate)
    }
  }, [user])

  useEffect(() => {
    if (userConversations.length > 0 && lastConnection) {
      // Extraire tous les messages non lus avec une comparaison >=
      const unreadMessages = userConversations.flatMap(conv => 
        conv.messages
          .filter(msg => new Date(msg.timestamp) >= lastConnection && msg.sender_id !== user.id)
          .map(msg => ({
            ...msg,
            conversationId: conv.id,
            conversationName: conversationNames[conv.id] || conv.name || 'Notes personnelles'
          }))
      )
      // Trier par date décroissante
      const sortedMessages = unreadMessages.sort((a, b) => 
        new Date(b.timestamp) - new Date(a.timestamp)
      )
      setRecentMessages(sortedMessages)
    } else {
      setRecentMessages([])
    }
  }, [userConversations, conversationNames, lastConnection, user?.id])

  const fetchFriends = async () => {
    try {
      // Récupérer d'abord les amis
      const { data: friendsData, error: friendsError } = await supabase
        .from('friends')
        .select('friend_id, is_favorite')
        .eq('user_id', user.id)
        .order('is_favorite', { ascending: false })

      if (friendsError) {
        console.error('Détails de l\'erreur:', friendsError)
        throw friendsError
      }

      if (!friendsData) {
        setFriends([])
        setFavorites([])
        return
      }

      // Récupérer les informations des utilisateurs amis
      const friendIds = friendsData.map(f => f.friend_id)
      const { data: usersData, error: usersError } = await supabase
          .from('users')
          .select('id, username')
        .in('id', friendIds)

      if (usersError) {
        console.error('Erreur lors de la récupération des utilisateurs:', usersError)
        throw usersError
      }

      // Combiner les données
      const friendsList = friendsData.map(friend => {
        const userInfo = usersData.find(u => u.id === friend.friend_id)
        return {
          id: friend.friend_id,
          username: userInfo ? userInfo.username : 'Utilisateur inconnu',
          isFavorite: friend.is_favorite
        }
      })

      setFriends(friendsList)
      setFavorites(friendsList.filter(friend => friend.isFavorite))
    } catch (error) {
      console.error('Erreur lors de la récupération des amis:', error)
      setFriends([])
      setFavorites([])
    }
  }

  const handleSearch = async (query) => {
    if (query.length < 2) {
      setSearchResults([])
      return
    }

    setIsSearching(true)
    try {
      const { data, error } = await supabase
          .from('users')
          .select('id, username')
        .ilike('username', `%${query}%`)
        .neq('id', user.id)
        .limit(5)

      if (error) throw error
      setSearchResults(data || [])
    } catch (error) {
      console.error('Erreur de recherche:', error)
    } finally {
      setIsSearching(false)
    }
  }

  const addFriend = async (friendId) => {
    try {
      // Vérifier si l'amitié existe déjà
      const { data: existingFriendship, error: checkError } = await supabase
        .from('friends')
        .select('id')
        .eq('user_id', user.id)
        .eq('friend_id', friendId)
          .single()
        
      if (checkError && checkError.code !== 'PGRST116') {
        console.log('Erreur lors de la vérification:', checkError)
        return
      }

      if (existingFriendship) {
        console.log('Cette amitié existe déjà')
        return
      }

      // Créer la nouvelle amitié
      const { error } = await supabase
        .from('friends')
        .insert({
          user_id: user.id,
          friend_id: friendId,
          is_favorite: false
        })

      if (error) {
        console.error('Détails de l\'erreur:', error)
        throw error
      }

      await fetchFriends()
    } catch (error) {
      console.error('Erreur lors de l\'ajout d\'un ami:', error)
    }
  }

  const toggleFavorite = async (friendId) => {
    try {
      const isCurrentlyFavorite = favorites.some(f => f.id === friendId)
      const { error } = await supabase
        .from('friends')
        .update({ is_favorite: !isCurrentlyFavorite })
        .eq('user_id', user.id)
        .eq('friend_id', friendId)

      if (error) {
        console.error('Détails de l\'erreur:', error)
        throw error
      }
      await fetchFriends()
    } catch (error) {
      console.error('Erreur lors de la mise à jour du favori:', error)
    }
  }

  const handleLogout = () => {
    // Sauvegarder la date de dernière connexion avec un décalage d'une seconde
    if (user) {
      localStorage.setItem(`lastConnection_${user.id}`, new Date(Date.now() - 1000).toISOString())
    }
    setUser(null)
    setSearchQuery('')
    setSearchResults([])
    setSelectedUser(null)
    setUserConversations([])
    setOpenedConversationId(null)
    setFriends([])
    setFavorites([])
    setLastConnection(null)
  }

  const hasNewMessages = (conversation) => {
    if (!conversation.messages || conversation.messages.length === 0) return false
    const lastReadId = localStorage.getItem(`lastRead_${conversation.id}_${user.id}`)
    if (!lastReadId) {
      // Si jamais aucune lecture, tous les messages sont non lus sauf ceux envoyés par soi-même
      return conversation.messages.some(msg => msg.sender_id !== user.id)
    }
    return conversation.messages.some(msg => msg.id > lastReadId && msg.sender_id !== user.id)
  }

  const getNewMessagesCount = (conversation) => {
    if (!conversation.messages) return 0
    const lastReadId = localStorage.getItem(`lastRead_${conversation.id}_${user.id}`)
    if (!lastReadId) {
      return conversation.messages.filter(msg => msg.sender_id !== user.id).length
    }
    return conversation.messages.filter(msg => msg.id > lastReadId && msg.sender_id !== user.id).length
  }

  const fetchUnreadConversations = async () => {
    try {
      const { data: conversations, error } = await supabase
        .from('conversations')
        .select(`
          id,
          name,
          is_group,
          created_by,
          conversation_participants!inner (
            user_id
          ),
          messages (
            id,
            content,
            timestamp,
            sender_id
          )
        `)
        .eq('is_group', false)
        .filter('conversation_participants.user_id', 'eq', user.id)

      if (error) {
        console.error('Erreur Supabase:', error)
        throw error
      }

      // Trier les messages de chaque conversation par date
      const conversationsWithSortedMessages = conversations.map(conv => ({
        ...conv,
        messages: conv.messages?.sort((a, b) => 
          new Date(b.timestamp) - new Date(a.timestamp)
        ) || []
      }))

      // Filtrer pour ne garder que les conversations avec des messages non lus
      const conversationsWithUnreadMessages = conversationsWithSortedMessages.filter(conv => 
        hasNewMessages(conv)
      )

      // Mettre à jour les noms de conversation dans l'état local
      const newConversationNames = {}
      conversationsWithUnreadMessages.forEach(conv => {
        if (conv.name) {
          newConversationNames[conv.id] = conv.name
        }
      })
      setConversationNames(newConversationNames)

      console.log('Conversations non lues trouvées:', conversationsWithUnreadMessages)
      setUserConversations(conversationsWithUnreadMessages)
    } catch (error) {
      console.error('Erreur lors de la récupération des conversations non lues:', error)
      setUserConversations([])
    }
  }

  const fetchUserConversations = async (selectedUser) => {
    try {
      const { data: conversations, error } = await supabase
        .from('conversations')
        .select(`
          id,
          name,
          is_group,
          created_by,
          conversation_participants!inner (
            user_id
          ),
          messages (
            id,
            content,
            timestamp,
            sender_id
          )
        `)
        .eq('is_group', false)
        .filter('conversation_participants.user_id', 'eq', user.id)

      if (error) {
        console.error('Erreur Supabase:', error)
        throw error
      }

      // Filtrer les conversations selon le contexte
      let filteredConversations
      if (selectedUser.id === user.id) {
        // Pour les notes personnelles, ne garder que les conversations avec soi-même
        filteredConversations = conversations.filter(conv => {
          const participants = conv.conversation_participants.map(p => p.user_id)
          return participants.length === 1 && participants[0] === user.id
        })
      } else {
        // Pour les autres conversations, garder celles où les deux utilisateurs sont participants
        filteredConversations = conversations.filter(conv => {
          const participants = conv.conversation_participants.map(p => p.user_id)
          return participants.includes(user.id) && participants.includes(selectedUser.id)
        })
      }

      // Trier les messages de chaque conversation par date
      const conversationsWithSortedMessages = filteredConversations.map(conv => ({
        ...conv,
        messages: conv.messages?.sort((a, b) => 
          new Date(b.timestamp) - new Date(a.timestamp)
        ) || []
      }))

      // Mettre à jour les noms de conversation dans l'état local
      const newConversationNames = {}
      conversationsWithSortedMessages.forEach(conv => {
        if (conv.name) {
          newConversationNames[conv.id] = conv.name
        }
      })
      setConversationNames(newConversationNames)

      console.log('Conversations avec l\'utilisateur trouvées:', conversationsWithSortedMessages)
      setUserConversations(conversationsWithSortedMessages)
    } catch (error) {
      console.error('Erreur lors de la récupération des conversations avec l\'utilisateur:', error)
      setUserConversations([])
    }
  }

  const handleUserSelect = async (selectedUser) => {
    setSelectedUser(selectedUser)
    await fetchUserConversations(selectedUser)
  }

  // Ajouter un useEffect pour charger les conversations non lues au démarrage
  useEffect(() => {
    if (user && !selectedUser) {
      fetchUnreadConversations()
    }
  }, [user, selectedUser])

  const startNewConversation = async () => {
    try {
      // Créer une nouvelle conversation
      const { data: newConversation, error: createError } = await supabase
        .from('conversations')
        .insert([
          {
            is_group: false,
            name: selectedUser.id === user.id ? 'Notes personnelles' : `${user.username} - ${selectedUser.username}`,
            created_by: user.id
          }
        ])
        .select()
        .single()

      if (createError) throw createError

      console.log('Nouvelle conversation créée:', newConversation)

      // Ajouter les participants à la conversation
      const participants = selectedUser.id === user.id 
        ? [{ conversation_id: newConversation.id, user_id: user.id }]
        : [
            { conversation_id: newConversation.id, user_id: user.id },
            { conversation_id: newConversation.id, user_id: selectedUser.id }
          ]

      const { error: participantsError } = await supabase
        .from('conversation_participants')
        .insert(participants)

      if (participantsError) throw participantsError

      console.log('Participants ajoutés à la conversation')

      setOpenedConversationId(newConversation.id)
      setSelectedUser(null)
      setUserConversations([])
    } catch (error) {
      console.error('Erreur lors de la création de la conversation:', error)
    }
  }

  const handleConversationUpdate = (conversationId, newName) => {
    // Mettre à jour conversationNames
    setConversationNames(prev => ({
      ...prev,
      [conversationId]: newName
    }))

    // Mettre à jour userConversations
    setUserConversations(prev => 
      prev.map(conv => 
        conv.id === conversationId 
          ? { ...conv, name: newName }
          : conv
      )
    )
  }

  if (!user) {
    return <Login onLogin={setUser} />
  }

  if (openedConversationId) {
    return (
      <Conversation
        conversationId={openedConversationId}
        userId={user.id}
        onBack={() => setOpenedConversationId(null)}
        onConversationUpdate={handleConversationUpdate}
      />
    )
  }

  return (
      <div style={{ 
        display: 'flex', 
      height: '100vh',
      backgroundColor: '#36393f',
      fontFamily: 'Whitney, "Helvetica Neue", Helvetica, Arial, sans-serif'
    }}>
      {/* Barre latérale */}
      <div style={{
        width: '240px',
        backgroundColor: '#2f3136',
        padding: '1rem',
        color: '#dcddde',
        borderRight: '1px solid #202225',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden' // Empêche le débordement
      }}>
        <div style={{ 
          marginBottom: '1rem',
          paddingBottom: '1rem',
          borderBottom: '1px solid #202225'
        }}>
          <h1 style={{ 
            fontSize: '1.5rem', 
            margin: 0,
            color: '#ffffff',
            fontWeight: 'bold'
          }}>SachMS</h1>
        </div>

        {/* Conversation avec soi-même */}
        <div style={{
          marginBottom: '2rem',
          padding: '0.75rem',
          backgroundColor: '#40444b',
          borderRadius: '4px',
          cursor: 'pointer',
          transition: 'background-color 0.2s ease'
        }}
          onClick={() => handleUserSelect({ id: user.id, username: user.username })}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              backgroundColor: '#5865f2',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '1rem',
              fontWeight: '500'
            }}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            <span>Notes personnelles</span>
          </div>
        </div>

        {/* Barre de recherche */}
        <div style={{ 
          marginBottom: '2rem',
          position: 'relative'
        }}>
          <input
            type="text"
            placeholder="Rechercher un utilisateur..."
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value)
              handleSearch(e.target.value)
            }}
            style={{
              width: '100%',
              padding: '0.75rem',
              backgroundColor: '#202225',
              border: 'none',
              borderRadius: '4px',
              color: '#dcddde',
              fontSize: '0.9rem',
              marginBottom: '1rem',
              boxSizing: 'border-box' // Empêche le padding d'augmenter la largeur
            }}
          />
          {isSearching && (
            <div style={{ 
              position: 'absolute', 
              right: '10px', 
              top: '50%', 
              transform: 'translateY(-50%)',
              color: '#dcddde'
            }}>
              Chargement...
            </div>
          )}
          {searchResults.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              right: 0,
              backgroundColor: '#2f3136',
              border: '1px solid #202225',
              borderRadius: '4px',
              marginTop: '0.5rem',
              zIndex: 1000,
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              {searchResults.map((result) => (
                <div
                  key={result.id}
                  onClick={() => handleUserSelect(result)}
                  style={{
                    padding: '0.75rem 1rem',
                    cursor: 'pointer',
                    borderBottom: '1px solid #202225',
                    backgroundColor: selectedUser?.id === result.id ? '#40444b' : 'transparent',
                    color: '#dcddde',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#40444b'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = selectedUser?.id === result.id ? '#40444b' : 'transparent'}
                >
                  <span>{result.username}</span>
                  {!friends.some(f => f.id === result.id) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        addFriend(result.id)
                      }}
                      style={{
                        padding: '0.25rem 0.5rem',
                        backgroundColor: '#5865f2',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '0.8rem',
                        fontWeight: '500'
                      }}
                    >
                      Ajouter
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Liste des amis favoris */}
        <div style={{
          marginBottom: '2rem'
        }}>
          <h3 style={{
            color: '#dcddde',
            fontSize: '0.9rem',
            fontWeight: '500',
            marginBottom: '1rem',
            paddingLeft: '0.5rem'
          }}>
            Amis favoris
          </h3>
          {favorites.length === 0 ? (
            <div style={{
              color: '#72767d',
              fontSize: '0.9rem',
              padding: '0.5rem',
              textAlign: 'center'
            }}>
              Aucun ami favori
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              {favorites.map((friend) => (
                <div
                  key={friend.id}
                  onClick={() => handleUserSelect(friend)}
                  style={{
                    padding: '0.75rem 1rem',
                    cursor: 'pointer',
                    backgroundColor: selectedUser?.id === friend.id ? '#40444b' : 'transparent',
                    color: '#dcddde',
                    borderRadius: '4px',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#40444b'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = selectedUser?.id === friend.id ? '#40444b' : 'transparent'}
                >
                  <span>{friend.username}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFavorite(friend.id)
                    }}
                    style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: 'transparent',
                      color: '#dcddde',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.2rem'
                    }}
                  >
                    ⭐
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Liste des amis */}
        <div style={{ flex: 1 }}>
          <h3 style={{
            color: '#dcddde',
            fontSize: '0.9rem',
            fontWeight: '500',
            marginBottom: '1rem',
            paddingLeft: '0.5rem'
          }}>
            Tous les amis
          </h3>
          {friends.length === 0 ? (
            <div style={{
              color: '#72767d',
              fontSize: '0.9rem',
              padding: '0.5rem',
              textAlign: 'center'
            }}>
              Aucun ami
            </div>
          ) : (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
            }}>
              {friends.map((friend) => (
                <div
                  key={friend.id}
                  onClick={() => handleUserSelect(friend)}
                  style={{
                    padding: '0.75rem 1rem',
                    cursor: 'pointer',
                    backgroundColor: selectedUser?.id === friend.id ? '#40444b' : 'transparent',
                    color: '#dcddde',
                    borderRadius: '4px',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#40444b'}
                  onMouseOut={(e) => e.currentTarget.style.backgroundColor = selectedUser?.id === friend.id ? '#40444b' : 'transparent'}
                >
                  <span>{friend.username}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleFavorite(friend.id)
                    }}
                    style={{
                      padding: '0.25rem 0.5rem',
                      backgroundColor: 'transparent',
                      color: friend.isFavorite ? '#faa61a' : '#dcddde',
                      border: 'none',
                      cursor: 'pointer',
                      fontSize: '1.2rem'
                    }}
                  >
                    ⭐
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Bouton de déconnexion en bas */}
        <div style={{
          borderTop: '1px solid #202225',
          paddingTop: '1rem',
          marginTop: 'auto'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.5rem',
            backgroundColor: '#40444b',
            borderRadius: '4px',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
          }}
            onClick={() => {
              setSelectedUser(null)
              setOpenedConversationId(null)
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4f545c'}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#40444b'}
          >
            <div style={{
              width: '32px',
              height: '32px',
              backgroundColor: '#5865f2',
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '1rem',
              fontWeight: '500'
            }}>
              {user.username.charAt(0).toUpperCase()}
            </div>
            <span style={{
              flex: 1,
              color: '#dcddde'
            }}>
              {user.username}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation()
                handleLogout()
              }}
              style={{
                padding: '0.5rem',
                backgroundColor: '#ed4245',
                color: '#ffffff',
                border: 'none',
                cursor: 'pointer',
                borderRadius: '4px',
                fontSize: '0.8rem',
                fontWeight: '500',
                transition: 'all 0.2s ease'
              }}
              onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#c03537'}
              onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#ed4245'}
            >
              Déconnexion
          </button>
          </div>
        </div>
      </div>

      {/* Zone principale */}
      <div style={{ 
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '1rem'
      }}>
        {selectedUser ? (
          <div style={{ 
            padding: '1rem',
            backgroundColor: '#2f3136',
            border: '1px solid #202225',
            borderRadius: '4px',
            marginBottom: '1rem'
          }}>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center',
              marginBottom: '1rem',
              color: '#dcddde'
            }}>
              <h2 style={{ 
                fontSize: '1.2rem',
                margin: 0,
                fontWeight: '500'
              }}>
                Conversations avec {selectedUser.username}
              </h2>
              <button
                onClick={startNewConversation}
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
                Nouvelle conversation
              </button>
            </div>

            {userConversations.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                color: '#dcddde',
                fontSize: '1rem'
              }}>
                Aucune conversation avec cet utilisateur
              </div>
            ) : (
              <div style={{
                overflow: 'auto',
                maxHeight: '400px'
              }}>
                {userConversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => setOpenedConversationId(conv.id)}
                    style={{
                      padding: '1rem',
                      cursor: 'pointer',
                      backgroundColor: '#40444b',
                      border: '1px solid #202225',
                      borderRadius: '4px',
                      marginBottom: '0.5rem',
                      transition: 'all 0.2s ease',
                      position: 'relative',
                      borderLeft: hasNewMessages(conv) ? '4px solid #faa61a' : 'none'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4f545c'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#40444b'}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      color: '#dcddde'
                    }}>
                      <div>
                        <div style={{ 
                          fontSize: '1rem',
                          fontWeight: '500',
                          color: hasNewMessages(conv) ? '#faa61a' : '#dcddde',
                          marginBottom: '0.5rem'
                        }}>
                          {conv.name || 'Notes personnelles'}
                        </div>
                        {conv.messages && conv.messages.length > 0 && (
                          <div style={{ 
                            fontSize: '0.9rem', 
                            color: hasNewMessages(conv) ? '#faa61a' : '#b9bbbe',
                            marginBottom: '0.5rem'
                          }}>
                            {conv.messages[0].content}
                          </div>
                        )}
                        <div style={{ 
                          fontSize: '0.8rem', 
                          color: '#72767d',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem'
                        }}>
                          <span>Participants:</span>
                          {conv.conversation_participants && conv.conversation_participants.map((p, index) => (
                            <span key={p.user_id}>
                              {p.user_id === user.id ? 'Vous' : p.username}
                              {index < conv.conversation_participants.length - 1 ? ', ' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {conv.messages && conv.messages.length > 0 && (
                          <div style={{ 
                            fontSize: '0.8rem', 
                            color: hasNewMessages(conv) ? '#faa61a' : '#72767d'
                          }}>
                            {new Date(conv.messages[0].timestamp).toLocaleString()}
                          </div>
                        )}
                        {hasNewMessages(conv) && (
                          <div style={{
                            backgroundColor: '#faa61a',
                            color: '#ffffff',
                            borderRadius: '50%',
                            width: '20px',
                            height: '20px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '0.8rem',
                            fontWeight: 'bold'
                          }}>
                            {getNewMessagesCount(conv)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div style={{
            padding: '1rem',
            backgroundColor: '#2f3136',
            border: '1px solid #202225',
            borderRadius: '4px',
            height: '100%'
          }}>
            <h2 style={{
              color: '#dcddde',
              marginBottom: '1rem',
              fontSize: '1.2rem',
              fontWeight: '500'
            }}>
              Messages récents
            </h2>
            <div style={{
              overflowY: 'auto',
              maxHeight: 'calc(100vh - 200px)'
            }}>
              {userConversations.length === 0 ? (
                <div style={{
                  color: '#72767d',
                  textAlign: 'center',
                  padding: '2rem'
                }}>
                  Aucun message récent
                </div>
              ) : (
                userConversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => {
                      setSelectedUser({ id: conv.created_by, username: conv.name })
                      setOpenedConversationId(conv.id)
                    }}
                    style={{
                      padding: '1rem',
                      marginBottom: '0.5rem',
                      backgroundColor: '#40444b',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = '#4f545c'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = '#40444b'}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: '0.5rem'
                    }}>
                      <div style={{
                        fontWeight: '500',
                        color: '#dcddde'
                      }}>
                        {conv.name}
                      </div>
                      <div style={{
                        fontSize: '0.8rem',
                        color: '#72767d'
                      }}>
                        {new Date(conv.messages[0].timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div style={{
                      color: '#b9bbbe',
                      fontSize: '0.9rem'
                    }}>
                      {conv.messages[0].content}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App

