export interface Booking {
  id: number;
  room_id: number;
  name: string;
  start_time: string;
  end_time: string;
  comment: string;
}

export interface BookingPayload {
  roomId: number;
  name: string;
  startTime: string;
  endTime: string;
  date: string;
  comment?: string;
}
