export interface Booking {
  id: number;
  room_id: number;
  title: string;
  start_time: string;
  end_time: string;
  comment: string | null;
}

export interface BookingPayload {
  roomId: number;
  title: string;
  startTime: string;
  endTime: string;
  date: string;
  comment?: string;
}
