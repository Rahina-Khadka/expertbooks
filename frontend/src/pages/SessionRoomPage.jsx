import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import useWebRTC from '../hooks/useWebRTC';
import Navbar from '../components/Navbar';
import socketService from '../services/socketService';
import messageService from '../services/messageService';
import bookingService from '../services/bookingService';
import userService from '../services/userService';

const SessionRoomPage = () => {
  const { bookingId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isOtherUserOnline, setIsOtherUserOnline] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [expertProfile, setExpertProfile] = useState(null);
  const [paymentProof, setPaymentProof] = useState('');
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [paymentDone, setPaymentDone] = useState(false);
  const [confirmingPayment, setConfirmingPayment] = useState(false);
  const paymentProofRef = useRef(null);

  const messagesEndRef = useRef(null);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  // Track whether socket listeners have been registered to avoid duplicates
  const listenersRegistered = useRef(false);

  const {
    localStream,
    remoteStream,
    isAudioEnabled,
    isVideoEnabled,
    isConnected,
    initializeMedia,
    createOffer,
    toggleAudio,
    toggleVideo,
    cleanup,
    registerSignalingListeners,
  } = useWebRTC(bookingId);

  useEffect(() => {
    initializeSession();
    return () => {
      cleanup();
      // Remove all socket listeners before disconnecting
      if (socketService.socket) {
        socketService.socket.off('receive-message');
        socketService.socket.off('user-joined');
        socketService.socket.off('user-left');
        socketService.socket.off('webrtc-offer');
        socketService.socket.off('webrtc-answer');
        socketService.socket.off('webrtc-ice-candidate');
      }
      socketService.disconnect();
    };
  }, [bookingId]);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const addSystemMessage = useCallback((text) => {
    setMessages(prev => {
      // Prevent duplicate system messages
      const last = prev[prev.length - 1];
      if (last?.type === 'system' && last?.message === text) return prev;
      return [...prev, {
        _id: Date.now().toString(),
        message: text,
        type: 'system',
        createdAt: new Date()
      }];
    });
  }, []);

  const initializeSession = async () => {
    try {
      const bookings = await bookingService.getBookings();
      const currentBooking = bookings.find(b => b._id === bookingId);

      if (!currentBooking) {
        setError('Booking not found');
        setLoading(false);
        return;
      }

      const isParticipant =
        currentBooking.userId._id === user._id ||
        currentBooking.expertId._id === user._id;

      if (!isParticipant) {
        setError('You are not authorized to access this session');
        setLoading(false);
        return;
      }

      setBooking(currentBooking);

      // Fetch expert profile for QR code
      try {
        const ep = await userService.getExpertProfile(currentBooking.expertId._id);
        setExpertProfile(ep);
      } catch (_) {}

      // If booking is already in payment state, show payment UI
      if (['payment_pending', 'paid', 'completed'].includes(currentBooking.status)) {
        setSessionEnded(true);
        if (currentBooking.paymentStatus === 'payment_pending' || currentBooking.paymentStatus === 'paid') {
          setPaymentDone(true);
        }
      }

      // Connect socket
      const token = localStorage.getItem('token') || sessionStorage.getItem('token');
      socketService.connect(token);

      // Wait a tick for socket to establish before registering listeners
      await new Promise(r => setTimeout(r, 300));

      // Guard: only register listeners once
      if (!listenersRegistered.current) {
        listenersRegistered.current = true;

        // Chat messages — deduplicate by _id
        socketService.socket.on('receive-message', (message) => {
          setMessages(prev => {
            if (prev.some(m => m._id === message._id)) return prev;
            return [...prev, message];
          });
        });

        socketService.socket.on('user-joined', () => {
          setIsOtherUserOnline(true);
          addSystemMessage('Other participant joined the session');
        });

        socketService.socket.on('user-left', () => {
          setIsOtherUserOnline(false);
          addSystemMessage('Other participant left the session');
        });

        // Register WebRTC signaling listeners now that socket is ready
        registerSignalingListeners();
      }

      // Join room
      socketService.joinRoom(bookingId);

      // Load previous messages
      const previousMessages = await messageService.getMessages(bookingId);
      setMessages(previousMessages);

      await initializeMedia(true, false);
      setLoading(false);
    } catch (err) {
      console.error('Error initializing session:', err);
      setError('Failed to initialize session');
      setLoading(false);
    }
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (newMessage.trim()) {
      socketService.sendMessage(bookingId, newMessage, user.name);
      setNewMessage('');
    }
  };

  const handleStartCall = () => {
    createOffer();
    addSystemMessage('Initiating call...');
  };

  const handleEndSession = () => {
    if (window.confirm('Are you sure you want to end this session?')) {
      cleanup();
      setSessionEnded(true);
    }
  };

  const handlePaymentProofUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPaymentProof(reader.result);
    reader.readAsDataURL(file);
  };

  const handleMarkPaid = async () => {
    setPaymentSubmitting(true);
    try {
      await bookingService.markPaymentDone(bookingId, paymentProof);
      setPaymentDone(true);
      setBooking(prev => ({ ...prev, status: 'payment_pending', paymentStatus: 'payment_pending' }));
    } catch (e) {
      alert('Failed to submit payment. Please try again.');
    } finally {
      setPaymentSubmitting(false);
    }
  };

  const handleConfirmPayment = async () => {
    setConfirmingPayment(true);
    try {
      await bookingService.confirmPayment(bookingId);
      setBooking(prev => ({ ...prev, status: 'completed', paymentStatus: 'paid' }));
    } catch (e) {
      alert('Failed to confirm payment.');
    } finally {
      setConfirmingPayment(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <Navbar />
        <div className="text-white text-lg">Loading session...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <Navbar />
        <div className="max-w-7xl mx-auto px-4 pt-24 pb-8 text-center">
          <h2 className="text-2xl font-bold text-red-600 mb-4">{error}</h2>
          <Link to="/bookings" className="text-indigo-600 hover:underline">Back to Bookings</Link>
        </div>
      </div>
    );
  }

  const otherParticipant = user._id === booking.userId._id
    ? booking.expertId
    : booking.userId;

  const isLearner = user._id === booking.userId._id;
  const isExpert = user._id === booking.expertId._id;
  const sessionPrice = booking.sessionPrice || expertProfile?.hourlyRate || 0;
  const qr = expertProfile?.paymentQR;

  // Payment screen shown after session ends
  if (sessionEnded) {
    const paymentStatus = booking.paymentStatus;
    const isPaid = paymentStatus === 'paid' || booking.status === 'completed';

    return (
      <div className="min-h-screen bg-gray-900 flex flex-col">
        <Navbar />
        <div className="flex-1 flex items-center justify-center px-4 pt-20 pb-8">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">

            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-500 to-cyan-500 p-6 text-white text-center">
              <div className="text-4xl mb-2">{isPaid ? '✅' : '💳'}</div>
              <h2 className="text-xl font-bold">
                {isPaid ? 'Payment Complete' : 'Complete Your Payment'}
              </h2>
              <p className="text-indigo-100 text-sm mt-1">
                Session with {otherParticipant.name}
              </p>
            </div>

            <div className="p-6">
              {/* Expert view */}
              {isExpert && (
                <div className="text-center">
                  {isPaid ? (
                    <div className="py-6">
                      <div className="text-5xl mb-3">🎉</div>
                      <p className="text-green-600 font-bold text-lg">Payment Confirmed!</p>
                      <p className="text-gray-500 text-sm mt-1">Session marked as completed.</p>
                    </div>
                  ) : paymentDone || paymentStatus === 'payment_pending' ? (
                    <div>
                      <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 mb-5 text-left">
                        <p className="text-yellow-700 font-semibold text-sm">⏳ Payment Pending Confirmation</p>
                        <p className="text-yellow-600 text-xs mt-1">{otherParticipant.name} has marked the payment as done.</p>
                      </div>
                      {booking.paymentProof && (
                        <div className="mb-5">
                          <p className="text-sm font-medium text-gray-700 mb-2">Payment Proof:</p>
                          <img src={booking.paymentProof} alt="Payment proof" className="w-full rounded-xl border border-gray-200 object-contain max-h-48" />
                        </div>
                      )}
                      <button onClick={handleConfirmPayment} disabled={confirmingPayment}
                        className="w-full bg-green-500 text-white py-3 rounded-xl font-bold hover:bg-green-600 transition-colors disabled:opacity-60">
                        {confirmingPayment ? 'Confirming...' : '✅ Confirm Payment Received'}
                      </button>
                    </div>
                  ) : (
                    <div className="py-4">
                      <p className="text-gray-500 text-sm">Waiting for {otherParticipant.name} to complete the payment...</p>
                      <div className="mt-4 w-8 h-8 border-4 border-indigo-200 border-t-indigo-500 rounded-full animate-spin mx-auto" />
                    </div>
                  )}
                </div>
              )}

              {/* Learner view */}
              {isLearner && (
                <div>
                  {isPaid ? (
                    <div className="text-center py-6">
                      <div className="text-5xl mb-3">🎉</div>
                      <p className="text-green-600 font-bold text-lg">Payment Confirmed!</p>
                      <p className="text-gray-500 text-sm mt-1">Thank you. Session is now complete.</p>
                    </div>
                  ) : paymentDone || paymentStatus === 'payment_pending' ? (
                    <div className="text-center py-6">
                      <div className="text-5xl mb-3">⏳</div>
                      <p className="text-yellow-600 font-bold text-lg">Waiting for Expert Confirmation</p>
                      <p className="text-gray-500 text-sm mt-2">The expert will confirm your payment shortly.</p>
                    </div>
                  ) : (
                    <>
                      {/* Amount */}
                      {sessionPrice > 0 && (
                        <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-4 mb-5 flex justify-between items-center">
                          <span className="text-gray-600 text-sm font-medium">Session Fee</span>
                          <span className="text-indigo-600 font-bold text-lg">${sessionPrice}</span>
                        </div>
                      )}

                      {/* QR Code */}
                      {qr?.image ? (
                        <div className="text-center mb-5">
                          <div className="inline-block bg-white border-2 border-indigo-200 rounded-2xl p-4 shadow-sm">
                            <img src={qr.image} alt="Payment QR" className="w-48 h-48 object-contain mx-auto" />
                          </div>
                          {qr.platform && (
                            <div className="mt-2 inline-flex items-center gap-1.5 bg-green-50 text-green-700 text-xs font-semibold px-3 py-1 rounded-full border border-green-200">
                              📱 {qr.platform}
                              {qr.accountName && ` — ${qr.accountName}`}
                            </div>
                          )}
                          <p className="text-gray-500 text-xs mt-3">Scan this QR code using your mobile wallet to complete the payment</p>
                        </div>
                      ) : (
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center mb-5">
                          <p className="text-gray-400 text-sm">Expert hasn't set up a payment QR yet.</p>
                          <p className="text-gray-400 text-xs mt-1">Please arrange payment directly.</p>
                        </div>
                      )}

                      {/* Payment proof upload */}
                      <div className="mb-5">
                        <p className="text-sm font-medium text-gray-700 mb-2">Upload Payment Screenshot <span className="text-gray-400 font-normal">(optional)</span></p>
                        <div onClick={() => paymentProofRef.current?.click()}
                          className="border-2 border-dashed border-gray-200 rounded-xl p-4 text-center cursor-pointer hover:border-indigo-300 transition-colors">
                          {paymentProof
                            ? <img src={paymentProof} alt="proof" className="max-h-32 mx-auto rounded-lg object-contain" />
                            : <p className="text-gray-400 text-sm">📎 Click to upload screenshot</p>}
                        </div>
                        <input ref={paymentProofRef} type="file" accept="image/*" onChange={handlePaymentProofUpload} className="hidden" />
                      </div>

                      <button onClick={handleMarkPaid} disabled={paymentSubmitting}
                        className="w-full bg-gradient-to-r from-indigo-500 to-cyan-500 text-white py-3 rounded-xl font-bold hover:opacity-90 transition-opacity disabled:opacity-60 text-sm">
                        {paymentSubmitting ? 'Submitting...' : '✅ I Have Paid'}
                      </button>
                    </>
                  )}
                </div>
              )}

              <Link to="/bookings" className="block text-center text-sm text-gray-400 hover:text-indigo-500 mt-4 transition-colors">
                Back to Bookings
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col">
      <Navbar />

      <div className="flex-1 max-w-7xl w-full mx-auto px-4 pt-20 pb-4">
        {/* Header */}
        <div className="bg-gray-800 rounded-lg p-3 mb-4 flex justify-between items-center">
          <div>
            <h1 className="text-base font-bold text-white">Session with {otherParticipant.name}</h1>
            <p className="text-gray-400 text-xs">
              {new Date(booking.date).toLocaleDateString()} • {booking.startTime}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={`flex items-center gap-1.5 text-sm ${isOtherUserOnline ? 'text-green-400' : 'text-gray-400'}`}>
              <span className={`w-2 h-2 rounded-full ${isOtherUserOnline ? 'bg-green-400 animate-pulse' : 'bg-gray-400'}`} />
              {isOtherUserOnline ? 'Online' : 'Waiting...'}
            </span>
            <button onClick={handleEndSession}
              className="bg-red-600 text-white px-3 py-1.5 rounded-lg hover:bg-red-700 text-sm font-medium">
              End Session
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-4">
          {/* Video Section */}
          <div className="lg:col-span-2 space-y-4">
            <div className="bg-gray-800 rounded-lg overflow-hidden aspect-video relative">
              {remoteStream ? (
                <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center text-gray-400">
                    <div className="text-6xl mb-4">👤</div>
                    <p>Waiting for {otherParticipant.name} to join...</p>
                    {isOtherUserOnline && !isConnected && (
                      <p className="text-green-400 text-sm mt-2">
                        They're here — click "Start Call" to connect
                      </p>
                    )}
                  </div>
                </div>
              )}

              {localStream && (
                <div className="absolute bottom-4 right-4 w-48 h-36 bg-gray-700 rounded-lg overflow-hidden">
                  <video ref={localVideoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                </div>
              )}

              {isConnected && (
                <div className="absolute top-4 left-4 bg-green-500 text-white px-3 py-1 rounded-full text-sm">
                  Connected
                </div>
              )}
            </div>

            {/* Controls */}
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="flex justify-center gap-4">
                <button onClick={toggleAudio}
                  className={`p-4 rounded-full ${isAudioEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'}`}
                  title={isAudioEnabled ? 'Mute' : 'Unmute'}>
                  <span className="text-white text-xl">{isAudioEnabled ? '🎤' : '🔇'}</span>
                </button>

                <button onClick={toggleVideo}
                  className={`p-4 rounded-full ${isVideoEnabled ? 'bg-gray-700 hover:bg-gray-600' : 'bg-red-600 hover:bg-red-700'}`}
                  title={isVideoEnabled ? 'Stop Video' : 'Start Video'}>
                  <span className="text-white text-xl">{isVideoEnabled ? '📹' : '📷'}</span>
                </button>

                {!isConnected && isOtherUserOnline && (
                  <button onClick={handleStartCall}
                    className="px-6 py-3 bg-green-600 text-white rounded-full hover:bg-green-700 font-medium">
                    Start Call
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Chat Section */}
          <div className="bg-gray-800 rounded-lg flex flex-col h-[600px]">
            <div className="p-4 border-b border-gray-700">
              <h2 className="text-lg font-semibold text-white">Chat</h2>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.map((msg) => (
                <div key={msg._id}>
                  {msg.type === 'system' ? (
                    <div className="text-center text-gray-400 text-sm italic">{msg.message}</div>
                  ) : (
                    <div className={`flex ${msg.senderId === user._id ? 'justify-end' : 'justify-start'}`}>
                      <div className={`max-w-xs ${msg.senderId === user._id ? 'bg-indigo-600' : 'bg-gray-700'} text-white rounded-lg p-3`}>
                        <p className="text-xs text-gray-300 mb-1">{msg.senderName}</p>
                        <p className="break-words">{msg.message}</p>
                        <p className="text-xs text-gray-300 mt-1">
                          {new Date(msg.createdAt).toLocaleTimeString()}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-700">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  className="flex-1 bg-gray-700 text-white px-4 py-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <button type="submit"
                  className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700">
                  Send
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SessionRoomPage;
