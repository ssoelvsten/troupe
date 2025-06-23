  let-ret $decltemp$0 = let-ret authority1 = let-fun fun print2 print_arg15 =
                                                       let-ret print_pat16 = let-simple gensym1 = (print_arg15)
                                                                             in print_pat16 gensym1
                                                                             end
                                                       in let-simple gensym2 = fn $arg17 => let-simple gensym13 = is-tuple $arg17
                                                                                            in let-ret gensym7 = let-simple gensym8 = "pattern match failure in function print"
                                                                                                                 in assert gensym7
                                                                                                                    then let-ret x8 = let-ret $decltemp$9 = let-ret out10 = let-simple gensym3 = fprintln$base
                                                                                                                                                                            in let-simple gensym4 = (out10, x8)
                                                                                                                                                                               in gensym3 gensym4
                                                                                                                                                                               end
                                                                                                                                                                            end
                                                                                                                                                            in return $decltemp$9
                                                                                                                                                            end
                                                                                                                                      in let-simple gensym5 = getStdout$base
                                                                                                                                         in gensym5 authority1
                                                                                                                                         end
                                                                                                                                      end
                                                                                                                         in let-simple gensym6 = $arg17.0
                                                                                                                            in return gensym6
                                                                                                                            end
                                                                                                                         end
                                                                                                                    elseError gensym8
                                                                                                                 end
                                                                                               in if gensym13
                                                                                                  then let-simple gensym10 = tuple-length $arg17
                                                                                                       in let-simple gensym11 = 1
                                                                                                          in let-simple gensym9 = gensym10 = gensym11
                                                                                                             in return gensym9
                                                                                                             end
                                                                                                          end
                                                                                                       end
                                                                                                  else let-simple gensym12 = false
                                                                                                       in return gensym12
                                                                                                       end
                                                                                               end
                                                                                            end
                                                          in return gensym2
                                                          end
                                                       end
                                                     and printWithLabels3 printWithLabels_arg111 =
                                                       let-ret printWithLabels_pat112 = let-simple gensym14 = (printWithLabels_arg111)
                                                                                        in printWithLabels_pat112 gensym14
                                                                                        end
                                                       in let-simple gensym15 = fn $arg113 => let-simple gensym26 = is-tuple $arg113
                                                                                              in let-ret gensym20 = let-simple gensym21 = "pattern match failure in function printWithLabels"
                                                                                                                    in assert gensym20
                                                                                                                       then let-ret x14 = let-ret $decltemp$15 = let-ret out16 = let-simple gensym16 = fprintlnWithLabels$base
                                                                                                                                                                                 in let-simple gensym17 = (out16, x14)
                                                                                                                                                                                    in gensym16 gensym17
                                                                                                                                                                                    end
                                                                                                                                                                                 end
                                                                                                                                                                 in return $decltemp$15
                                                                                                                                                                 end
                                                                                                                                          in let-simple gensym18 = getStdout$base
                                                                                                                                             in gensym18 authority1
                                                                                                                                             end
                                                                                                                                          end
                                                                                                                            in let-simple gensym19 = $arg113.0
                                                                                                                               in return gensym19
                                                                                                                               end
                                                                                                                            end
                                                                                                                       elseError gensym21
                                                                                                                    end
                                                                                                 in if gensym26
                                                                                                    then let-simple gensym23 = tuple-length $arg113
                                                                                                         in let-simple gensym24 = 1
                                                                                                            in let-simple gensym22 = gensym23 = gensym24
                                                                                                               in return gensym22
                                                                                                               end
                                                                                                            end
                                                                                                         end
                                                                                                    else let-simple gensym25 = false
                                                                                                         in return gensym25
                                                                                                         end
                                                                                                 end
                                                                                              end
                                                          in return gensym15
                                                          end
                                                       end
                                                     and printString4 printString_arg117 =
                                                       let-ret printString_pat118 = let-simple gensym27 = (printString_arg117)
                                                                                    in printString_pat118 gensym27
                                                                                    end
                                                       in let-simple gensym28 = fn $arg119 => let-simple gensym41 = is-tuple $arg119
                                                                                              in let-ret gensym35 = let-simple gensym36 = "pattern match failure in function printString"
                                                                                                                    in assert gensym35
                                                                                                                       then let-ret x20 = let-ret $decltemp$21 = let-ret out22 = let-simple gensym29 = fwrite$base
                                                                                                                                                                                 in let-simple gensym32 = "\n"
                                                                                                                                                                                    in let-simple gensym30 = x20 ^ gensym32
                                                                                                                                                                                       in let-simple gensym31 = (out22, gensym30)
                                                                                                                                                                                          in gensym29 gensym31
                                                                                                                                                                                          end
                                                                                                                                                                                       end
                                                                                                                                                                                    end
                                                                                                                                                                                 end
                                                                                                                                                                 in return $decltemp$21
                                                                                                                                                                 end
                                                                                                                                          in let-simple gensym33 = getStdout$base
                                                                                                                                             in gensym33 authority1
                                                                                                                                             end
                                                                                                                                          end
                                                                                                                            in let-simple gensym34 = $arg119.0
                                                                                                                               in return gensym34
                                                                                                                               end
                                                                                                                            end
                                                                                                                       elseError gensym36
                                                                                                                    end
                                                                                                 in if gensym41
                                                                                                    then let-simple gensym38 = tuple-length $arg119
                                                                                                         in let-simple gensym39 = 1
                                                                                                            in let-simple gensym37 = gensym38 = gensym39
                                                                                                               in return gensym37
                                                                                                               end
                                                                                                            end
                                                                                                         end
                                                                                                    else let-simple gensym40 = false
                                                                                                         in return gensym40
                                                                                                         end
                                                                                                 end
                                                                                              end
                                                          in return gensym28
                                                          end
                                                       end
                                             in let-simple gensym43 = 100
                                                in let-simple gensym44 = 200
                                                   in let-simple gensym45 = {x=gensym43,x=gensym44}
                                                      in let-simple gensym42 = gensym45.x
                                                         in halt gensym42
                                                         end
                                                      end
                                                   end
                                                end
                                             end
                        in return $decltemp$0
                        end
  in let-simple gensym46 = $$authorityarg$base
     in return gensym46
     end
  end